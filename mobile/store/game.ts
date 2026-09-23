import { create } from 'zustand';
import { castFor } from '@/lib/cast';
import {
  api,
  ApiError,
  setSignedOutHandler,
  setTokenPersister,
  setTokens,
  type CityState,
  type ClientCase,
  type Entitlement,
  type RoomTheme,
  type SealStyle,
  type Session,
  type Standing,
  type VerdictResult,
} from '@/lib/api';
import { forgetGuest, type ProviderToken } from '@/lib/auth';
import { LEGAL_VERSION } from '@/lib/legalText';
import { resolveCountry } from '@/lib/location';
import { reportError, setReportingUser } from '@/lib/report';
import { storage } from '@/lib/storage';

const TOKEN_KEY = 'fault.session.tokens';

interface GameState {
  jurorId: string | null;
  jurorName: string | null;
  /** Display only; the server owns the real one. Always 120. */
  clockSeconds: number;
  entitlements: Entitlement[];
  merit: number;
  /** The courtroom and seal the juror has put on (lib/api Session.equipped). */
  equipped: { room: RoomTheme | null; seal: SealStyle | null };
  hasBriefed: boolean;

  activeCase: ClientCase | null;
  lastResult: VerdictResult | null;
  /** The decided case's accent, kept alive after activeCase is cleared so the
   *  verdict screen can still flash the colour the case arrived in. */
  lastAccent: string | null;
  /**
   * The person who was just judged, for the same reason.
   *
   * `activeCase` is cleared the moment a verdict lands — correctly, since the
   * trial is over and nothing should be able to re-read a decided dossier. But
   * the verdict screen now shows the accused reacting, and it cannot draw a
   * face it no longer has. Only what a portrait needs is kept: no evidence, no
   * witnesses, no charge.
   */
  /** Who was in the dock, for the verdict screen. `cast` is who played them (lib/cast). */
  lastDefendant: { portraitSeed: number; appearance: number; cast: string } | null;
  city: CityState | null;
  standing: Standing | null;

  bootstrapping: boolean;
  /**
   * The saved session could not be CHECKED — no network, or the server was
   * down or waking up. The tokens are kept; the cold open offers a retry
   * instead of the sign-in buttons.
   */
  offline: boolean;
  error: string | null;
  /**
   * The signed-in player has not accepted the current Terms and Privacy
   * Policy. The server decides (session/me, sign-in); components/ConsentGate
   * blocks the app until acceptConsent() succeeds.
   */
  consentRequired: boolean;
  acceptConsent: () => Promise<void>;

  bootstrap: () => Promise<void>;
  /** Sign in with a verified provider token. Country is resolved on device and
   *  only the ISO code is ever sent. */
  swearInWith: (token: ProviderToken, jurorName: string) => Promise<void>;
  signInExisting: (token: ProviderToken) => Promise<boolean>;
  refreshStanding: () => Promise<void>;
  /** The ordinary docket, a special docket by key, or the Daily Trial. */
  loadCase: (source?: { pack?: string; daily?: boolean }) => Promise<void>;
  /** null = the clock ran out and the player never chose. */
  deliverVerdict: (
    verdict: 'guilty' | 'not_guilty' | null,
    read?: { examined: number; witnesses: number; arguments: boolean },
  ) => Promise<VerdictResult>;
  refreshCity: () => Promise<void>;
  markBriefed: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  clearError: () => void;
}

export const useGame = create<GameState>((set, get) => ({
  jurorId: null,
  jurorName: null,
  clockSeconds: 120,
  entitlements: [],
  equipped: { room: null, seal: null },
  merit: 0,
  hasBriefed: false,

  activeCase: null,
  lastResult: null,
  lastDefendant: null,
  lastAccent: null,
  city: null,
  standing: null,

  bootstrapping: true,
  offline: false,
  error: null,
  consentRequired: false,

  /**
   * Re-attach this device's session.
   *
   * Restores the token pair into the API layer and installs the hooks it needs
   * to persist a rotated refresh token and to tell us when the session is
   * beyond saving.
   */
  bootstrap: async () => {
    setTokenPersister(async (t) => {
      await storage.set(TOKEN_KEY, JSON.stringify(t));
    });
    setSignedOutHandler(() => {
      void storage.remove(TOKEN_KEY);
      set({ jurorId: null, jurorName: null, activeCase: null, standing: null, consentRequired: false });
    });

    set({ offline: false });
    try {
      const raw = await storage.get(TOKEN_KEY);
      if (!raw) {
        set({ bootstrapping: false });
        return;
      }

      setTokens(JSON.parse(raw));
      const session: Session = await api.me();
      setReportingUser(session.userId);
      set({
        jurorId: session.userId,
        jurorName: session.jurorName,
        clockSeconds: session.clockSeconds,
        entitlements: session.entitlements,
        merit: session.merit,
        equipped: session.equipped ?? { room: null, seal: null },
        // A returning juror has already read the letter.
        hasBriefed: (session.casesHeard ?? 0) > 0,
        consentRequired: session.consentRequired ?? false,
        bootstrapping: false,
      });
    } catch (err) {
      // Only a session the server REFUSED is thrown away. This used to clear
      // the tokens on any failure at all — so opening the app on a train, or
      // while the server restarted or woke from sleep, signed the player out
      // (an Apple juror then had to sign in again from scratch).
      const transient = err instanceof ApiError && (err.status === 0 || err.status >= 500);
      if (transient) {
        set({ bootstrapping: false, offline: true });
        return;
      }
      // Tokens the server will not honour are worse than none. Worth
      // reporting even so: a bootstrap that fails for everyone is an outage,
      // and this catch used to make it invisible.
      reportError('bootstrap', err);
      setTokens(null);
      await storage.remove(TOKEN_KEY).catch(() => {});
      set({ bootstrapping: false });
    }
  },

  /**
   * First time through. Resolves the country on-device (coordinates never
   * leave the phone — see lib/location) and swears the juror in under the name
   * they chose, not the one their Apple or Google account carries.
   */
  swearInWith: async (token: ProviderToken, jurorName: string) => {
    const country = await resolveCountry();

    const result = await api.signIn({
      provider: token.provider,
      token: token.token,
      // The nonce the server issued for this attempt, carried back so it can
      // check that the provider signed THIS sign-in and not a replayed one.
      ...(token.nonce ? { nonce: token.nonce } : {}),
      ...(token.authorizationCode ? { authorizationCode: token.authorizationCode } : {}),
      // The sign-in screen says, above every button, that continuing means
      // agreeing to the Terms and Privacy Policy and being 13 or older. This
      // is the record of which edition they were shown.
      consentVersion: LEGAL_VERSION,
      jurorName,
      ...(country.code ? { country: country.code } : {}),
      // The player's own day is where streaks and daily missions end.
      timezone: deviceTimezone(),
    });

    await adoptSession(result);
    setReportingUser(result.userId);
    set({
      jurorId: result.userId,
      jurorName: result.jurorName,
      hasBriefed: false,
      consentRequired: result.consentRequired ?? false,
    });
    await get().refreshStanding();
    await get().refreshWallet();
  },

  /**
   * A returning juror. Returns false when the court has never met this
   * identity and needs a name before it will seat them.
   */
  signInExisting: async (token: ProviderToken) => {
    try {
      const result = await api.signIn({
        provider: token.provider,
        token: token.token,
        ...(token.nonce ? { nonce: token.nonce } : {}),
        ...(token.authorizationCode ? { authorizationCode: token.authorizationCode } : {}),
        consentVersion: LEGAL_VERSION,
        timezone: deviceTimezone(),
      });
      await adoptSession(result);
      setReportingUser(result.userId);
      set({
        jurorId: result.userId,
        jurorName: result.jurorName,
        // Same rule as bootstrap: the letter is owed to anyone who has never
        // heard a case. This used to assume that signing in meant having read
        // it, so a juror who swore in, quit on the letter and came back was
        // dropped straight into the lobby having been told nothing.
        hasBriefed: (result.casesHeard ?? 0) > 0,
        consentRequired: result.consentRequired ?? false,
      });
      await get().refreshStanding();
      await get().refreshWallet();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'juror_name_required') return false;
      throw err;
    }
  },

  refreshStanding: async () => {
    if (!get().jurorId) return;
    try {
      set({ standing: await api.standing() });
    } catch (err) {
      // Standing is a display concern; never block the room on it — but a
      // display concern that fails silently forever is how a broken endpoint
      // goes unnoticed for a month.
      reportError('refreshStanding', err);
    }
  },

  refreshWallet: async () => {
    if (!get().jurorId) return;
    try {
      const session = await api.me();
      set({
        merit: session.merit,
        entitlements: session.entitlements,
        equipped: session.equipped ?? { room: null, seal: null },
      });
    } catch (err) {
      reportError('refreshWallet', err);
    }
  },

  loadCase: async (source) => {
    if (!get().jurorId) throw new Error('not sworn in');
    const activeCase = source?.daily ? await api.dailyCase() : await api.nextCase(source?.pack);
    set({ activeCase });
  },

  /**
   * Deliver a verdict.
   *
   * We send the case and the direction. Nothing else: the server measures how
   * long we took and decides whether the clock beat us, because those are
   * facts about us and we are not a trustworthy witness to them.
   */
  deliverVerdict: async (verdict, read) => {
    const { activeCase } = get();
    if (!activeCase) throw new Error('no case in progress');

    const result = await api.submitVerdict({
      caseId: activeCase.id,
      ...(verdict ? { verdict } : {}),
      ...(read ? { read } : {}),
    });

    set({
      lastResult: result,
      lastAccent: activeCase.accent,
      lastDefendant: {
        portraitSeed: activeCase.defendant.portraitSeed,
        appearance: activeCase.defendant.appearance,
        cast: castFor(activeCase).defendant.key,
      },
      city: result.city,
      activeCase: null,
    });
    void get().refreshStanding();
    void get().refreshWallet();
    return result;
  },

  refreshCity: async () => {
    if (!get().jurorId) return;
    set({ city: await api.cityState() });
  },

  markBriefed: () => set({ hasBriefed: true }),

  acceptConsent: async () => {
    await api.acceptConsent(LEGAL_VERSION);
    set({ consentRequired: false });
  },

  signOut: async () => {
    try {
      await api.signOut();
    } catch (err) {
      // Signing out locally matters more than telling the server about it.
      reportError('signOut', err);
    }
    setTokens(null);
    setReportingUser(null);
    await storage.remove(TOKEN_KEY).catch(() => {});
    set({ jurorId: null, jurorName: null, activeCase: null, standing: null, city: null, consentRequired: false });
  },

  deleteAccount: async () => {
    await api.deleteAccount();
    setTokens(null);
    // Same as signOut: the deleted juror's id must not keep riding along on
    // every error report sent after they asked to be forgotten.
    setReportingUser(null);
    // And the guest secret goes too. It now names an account that does not
    // exist, and keeping it would make the next "play as guest" on this
    // phone silently swear in a stranger under the old secret — harmless,
    // but a deleted account should leave nothing of itself behind.
    await forgetGuest();
    await storage.remove(TOKEN_KEY).catch(() => {});
    set({ jurorId: null, jurorName: null, activeCase: null, standing: null, city: null, consentRequired: false });
  },

  clearError: () => set({ error: null }),
}));

/** The device's IANA zone, e.g. "Europe/Oslo". */
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function adoptSession(result: { accessToken: string; refreshToken: string }) {
  setTokens(result);
  await storage.set(
    TOKEN_KEY,
    JSON.stringify({ accessToken: result.accessToken, refreshToken: result.refreshToken }),
  );
}
