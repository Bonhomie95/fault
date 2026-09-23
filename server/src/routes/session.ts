import { Router } from 'express';
import { z } from 'zod';
import { CLOCK_SECONDS } from '../domain/clock.js';
import { checkJurorName, NAME_MAX } from '../domain/jurorName.js';
import { env, legalUrls } from '../lib/env.js';
import { LEGAL_VERSION } from '../lib/legalText.js';
import { log } from '../lib/log.js';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';
import { revokeAppleToken } from '../services/appleTokens.js';
import { entitlementsFor } from '../services/economy.js';
import { revokeAll } from '../services/tokens.js';

export const sessionRouter = Router();

/**
 * NOTE: `POST /api/session` is gone.
 *
 * It predated OAuth and minted a fully playable juror from nothing but a name
 * — no provider, no token, no verification. Every check in services/auth.ts
 * was bypassable by calling the older endpoint sitting next to it. Sign-in now
 * happens only through /api/auth/sign-in.
 *
 * `clockSeconds` is gone too: the deliberation window is a server constant
 * (domain/clock.ts), not a per-user setting, and the client is told what it is
 * rather than asked.
 */

sessionRouter.get('/me', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;
  const casesHeard = await prisma.verdictRecord.count({ where: { userId } });

  res.json({
    userId: user.id,
    jurorName: user.jurorName,
    clockSeconds: CLOCK_SECONDS,
    entitlements: await entitlementsFor(userId),
    merit: user.merit,
    casesHeard,
    /** The courtroom and seal the juror has put on. */
    equipped: { room: user.roomTheme, seal: user.sealStyle },
    /**
     * True when the player has not accepted the CURRENT Terms and Privacy
     * Policy — either they swore in before consent was recorded at all, or
     * legal/VERSION has moved since. The app's ConsentGate blocks play until
     * POST /api/session/consent. Computed here, not in the client, because
     * the client's copy of LEGAL_VERSION is only as new as its build.
     */
    consentRequired: user.consentVersion !== LEGAL_VERSION,
    legalVersion: LEGAL_VERSION,
    // Apple requires both to be reachable from inside the app. Served from
    // here rather than hardcoded in the client so they can be corrected
    // without shipping a build — a dead privacy policy link is a rejection.
    // They default to this server's own /legal pages (lib/env legalUrls).
    support: {
      privacyPolicyUrl: legalUrls.privacyPolicyUrl || null,
      termsUrl: legalUrls.termsUrl || null,
      supportEmail: env.SUPPORT_EMAIL || null,
    },
  });
});

/**
 * Accept the current Terms and Privacy Policy.
 *
 * The client must name the version it showed. Accepting "whatever is current"
 * blind would let a build that bundles last year's text record consent to
 * this year's — so a mismatch is a 409 carrying the version the server wants,
 * and the gate tells the player to update rather than pretending.
 */
sessionRouter.post('/consent', requireJuror, async (req, res) => {
  const parsed = z.object({ version: z.string().max(32) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'version required' });
    return;
  }
  if (parsed.data.version !== LEGAL_VERSION) {
    res.status(409).json({
      error: 'legal_version_mismatch',
      message: 'The court has published new papers. Update FAULT to read and accept them.',
      legalVersion: LEGAL_VERSION,
    });
    return;
  }

  const consentedAt = new Date();
  await prisma.user.update({
    where: { id: req.juror.userId },
    data: { consentedAt, consentVersion: LEGAL_VERSION },
  });
  res.json({ consentVersion: LEGAL_VERSION, consentedAt: consentedAt.toISOString() });
});

/**
 * Everything we hold about this juror, as one JSON document.
 *
 * GDPR Article 20 (portability) and Article 15 (access), and the "Download my
 * data" button in Settings. Deliberately assembled field by field rather than
 * dumped with `include: { everything }`: an export is published to the player,
 * and a new column added later — a provider secret, a moderation note — must
 * not appear in it just because somebody forgot this route existed.
 *
 * What is left out, and why:
 *   - appleRefreshToken and refresh-token hashes: credentials, not data about
 *     the player, and handing them out would make the export a security hole.
 *   - the full dossier of each case: the export lists every case heard with
 *     the charge, defendant and verdict. The evidence and testimony are
 *     generated fiction about invented people, not personal data.
 */
sessionRouter.get('/export', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;

  const [identities, cases, missions, merit, entitlements, purchases, news, city, profile, reports, applications] =
    await Promise.all([
      prisma.authIdentity.findMany({
        where: { userId },
        select: { provider: true, email: true, createdAt: true },
      }),
      prisma.case.findMany({
        where: { userId, verdict: { isNot: null } },
        orderBy: { caseNumber: 'asc' },
        select: {
          caseNumber: true,
          title: true,
          charge: true,
          country: true,
          jurisdiction: true,
          tier: true,
          defendantName: true,
          createdAt: true,
          verdict: {
            select: {
              verdict: true,
              timeRemaining: true,
              wasHung: true,
              outcomeText: true,
              xpAwarded: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.missionProgress.findMany({
        where: { userId },
        orderBy: { period: 'asc' },
        select: { key: true, kind: true, period: true, progress: true, target: true, claimed: true, completedAt: true },
      }),
      prisma.meritEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { delta: true, reason: true, reference: true, balance: true, createdAt: true },
      }),
      prisma.userEntitlement.findMany({
        where: { userId },
        select: { entitlement: true, source: true, grantedAt: true },
      }),
      prisma.purchase.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          sku: true,
          source: true,
          amountMinor: true,
          currency: true,
          meritSpent: true,
          transactionId: true,
          platform: true,
          createdAt: true,
        },
      }),
      prisma.newsItem.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { outlet: true, kind: true, headline: true, body: true, district: true, createdAt: true },
      }),
      prisma.cityState.findUnique({
        where: { userId },
        select: {
          crimeRate: true,
          judicialTrust: true,
          wealthDisparity: true,
          organizedCrimePower: true,
          policeIntegrity: true,
          mediaPressure: true,
          activeFactions: true,
          peaceIndex: true,
        },
      }),
      prisma.jurorProfile.findUnique({
        where: { userId },
        select: {
          convictionRate: true,
          evidenceWeight: true,
          socioeconomicBias: true,
          consistencyScore: true,
          pressureAccuracy: true,
          gutAccuracy: true,
          appearanceBias: true,
          demeanourBias: true,
          oddityBias: true,
          totalCases: true,
          writtenProfile: true,
        },
      }),
      prisma.contentReport.findMany({
        where: { reporterId: userId },
        select: { kind: true, subjectId: true, reason: true, detail: true, createdAt: true },
      }),
      prisma.jurisdictionApplication.findMany({
        where: { userId },
        select: { country: true, tier: true, status: true, decisionText: true, createdAt: true, decidedAt: true },
      }),
    ]);

  const body = {
    exportedAt: new Date().toISOString(),
    format: 'fault-export/1',
    profile: {
      userId: user.id,
      jurorName: user.jurorName,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      timezone: user.timezone,
      homeCountry: user.homeCountry,
      homeDistrict: user.homeDistrict,
      currentCountry: user.currentCountry,
      currentDistrict: user.currentDistrict,
      currentTier: user.currentTier,
      localeTag: user.localeTag,
      rank: user.rank,
      xp: user.xp,
      trust: user.trust,
      merit: user.merit,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      unlockedDistricts: user.unlockedDistricts,
      consentVersion: user.consentVersion,
      consentedAt: user.consentedAt,
    },
    signInMethods: identities.map((i) => ({
      // Guests are stored under the device provider; say what the player saw.
      provider: i.provider === 'device' ? 'guest' : i.provider,
      email: i.email,
      createdAt: i.createdAt,
    })),
    casesHeard: cases.map(({ verdict, ...c }) => ({ ...c, verdict })),
    city,
    jurorStatistics: profile,
    missions,
    meritLedger: merit,
    entitlements,
    purchases,
    news,
    jurisdictionApplications: applications,
    reportsFiled: reports,
  };

  res.set('Cache-Control', 'no-store');
  res.set('Content-Disposition', `attachment; filename="fault-export-${user.id}.json"`);
  res.json(body);
});

/**
 * Change the name on the record.
 *
 * This did not exist, and its absence was the real moderation problem. The
 * juror name is published on the leaderboard, and the only remedy an operator
 * had for an abusive one was deleting the account — which takes the player's
 * whole career with it for the sake of a string. Guideline 1.2 asks for the
 * ability to act on a report; this is that ability.
 *
 * Rate limited by the global limiter and bounded by a cooldown: a name that
 * can change every few seconds is a name nobody on the boards can report,
 * because it will not be the same name by the time anyone looks.
 */
const RENAME_COOLDOWN_HOURS = 24;

sessionRouter.patch('/me/name', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;

  const parsed = z
    .object({ jurorName: z.string().min(1).max(NAME_MAX * 4) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'jurorName required' });
    return;
  }

  const check = checkJurorName(parsed.data.jurorName);
  if (!check.ok) {
    res.status(400).json({ error: 'juror_name_rejected', reason: check.reason, message: check.message });
    return;
  }

  if (check.value === user.jurorName) {
    res.json({ jurorName: user.jurorName, changed: false });
    return;
  }

  const since = user.nameChangedAt
    ? Date.now() - user.nameChangedAt.getTime()
    : Number.POSITIVE_INFINITY;
  const cooldownMs = RENAME_COOLDOWN_HOURS * 3600_000;

  if (since < cooldownMs) {
    const hours = Math.ceil((cooldownMs - since) / 3600_000);
    res.status(429).json({
      error: 'rename_too_soon',
      message: `The register accepts one change a day. Try again in ${hours} hour${hours === 1 ? '' : 's'}.`,
      retryAfterHours: hours,
    });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { jurorName: check.value, nameChangedAt: new Date() },
  });

  // Logged so a moderated rename is traceable afterwards. The old name is
  // included because that is the one a report will have referred to.
  log.info('juror renamed', { userId, from: user.jurorName, to: check.value });

  res.json({ jurorName: check.value, changed: true });
});

/**
 * Delete everything.
 *
 * Apple requires in-app account deletion from any app that offers account
 * creation, and GDPR requires it of us regardless. The schema cascades from
 * User, so one delete takes the cases, verdicts, characters, city, ledger and
 * tokens with it.
 *
 * This is genuinely irreversible and there is no soft-delete hiding behind it:
 * a player who asks to be forgotten is asking for the whole career — every
 * verdict, the city they made — to stop existing. Anything less is a lie.
 */
sessionRouter.delete('/me', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;

  // Kill the tokens first: if the delete fails halfway, the account is at
  // least no longer reachable with the credentials the client holds.
  await revokeAll(userId);
  await prisma.user.delete({ where: { id: userId } });

  // Apple's side, after ours and never awaited (guideline 5.1.1(v)). Read
  // from the user row the middleware already loaded — the row itself is gone
  // now. A revoke that fails or hangs is logged by services/appleTokens and
  // must not turn a completed deletion into an error the player sees.
  if (user.appleRefreshToken) {
    void revokeAppleToken(userId, user.appleRefreshToken);
  }

  res.json({ deleted: true });
});
