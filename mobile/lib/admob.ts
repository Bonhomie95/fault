import { Platform, StatusBar, TurboModuleRegistry } from 'react-native';
import { reportError } from '@/lib/report';
import { setAdBackend, type AdBackend } from '@/lib/ads';

/**
 * Google AdMob, behind lib/ads' AdBackend.
 *
 * Three things happen here that are easy to get wrong:
 *
 *  1. CONSENT FIRST. In the EEA, the UK and Switzerland no ad may be requested
 *     until Google's consent form (UMP) has been answered, and on iOS the
 *     tracking prompt (ATT) comes after it. `startAds` does both, in that
 *     order, before the SDK is initialised. Everywhere else the form never
 *     shows and this costs nothing.
 *
 *  2. REWARDED VIEWS PAY ON GOOGLE'S WORD, NOT OURS. Each rewarded ad is
 *     created with server-side verification options — the juror's id and what
 *     the view is for — so Google calls our server (GET /api/store/ssv) when
 *     the view completes. The app never claims the reward in production.
 *
 *  3. NO TEST ADS IN PRODUCTION, NO REAL ADS IN DEVELOPMENT. Development builds
 *     use Google's test units; a release build without real unit ids simply
 *     has no ads, rather than serving test ads to the public (a policy
 *     violation) or crashing.
 *
 * Loaded lazily and optionally: a build without the native module has no ads.
 */

type Gma = typeof import('react-native-google-mobile-ads');

let gma: Gma | null | undefined;

function load(): Gma | null {
  if (gma !== undefined) return gma;
  gma = null;
  if (Platform.OS === 'web') return gma;
  try {
    if (TurboModuleRegistry.get('RNGoogleMobileAdsModule')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, see above
      gma = require('react-native-google-mobile-ads') as Gma;
    }
  } catch {
    gma = null;
  }
  return gma;
}

/** Real unit ids come from the build (eas.json env); dev falls back to Google's test units. */
function unitIds(g: Gma): { interstitial: string | null; rewarded: string | null } {
  const ios = Platform.OS === 'ios';
  const interstitial = ios
    ? process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL
    : process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL;
  const rewarded = ios ? process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED : process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED;
  if (__DEV__) {
    return { interstitial: g.TestIds.INTERSTITIAL, rewarded: g.TestIds.REWARDED };
  }
  return { interstitial: interstitial || null, rewarded: rewarded || null };
}

/**
 * Full-screen adverts under an app-wide status bar.
 *
 * The app controls the status bar app-wide (UIViewControllerBasedStatusBar-
 * Appearance NO, which React Native's StatusBar requires), so an advert
 * cannot hide it — and the advert's own close button then sits UNDER the
 * clock and the battery, where nobody can tap it. Found on the simulator: a
 * rewarded ad with no way out. So the app hides the bar itself for the
 * advert's lifetime.
 */
function adCovering(on: boolean): void {
  if (Platform.OS !== 'ios') return;
  // iOS 27 retired the app-wide status bar API: `setStatusBarHidden` is now a
  // documented no-op and only logs a deprecation line each time an advert
  // opens. Calling it there would be code that pretends to do something, so
  // it is skipped — but that means the close-button problem this exists to
  // solve is UNMITIGATED on iOS 27 and has to be re-checked on a device.
  // Under the scene life cycle the status bar belongs to whichever view
  // controller is on screen, which during an advert is Google's, not ours.
  if (Number.parseInt(String(Platform.Version), 10) >= 27) return;
  StatusBar.setHidden(on, 'none');
}

/** How long a rewarded advert may take to LOAD before the slot is given up. */
const REWARDED_LOAD_MS = 15_000;

let userId: string | null = null;
let started: Promise<boolean> | null = null;
let privacyOptionsRequired = false;

/** Who rewarded views are paid to. Set once the juror is known. */
export function setAdUser(id: string | null): void {
  userId = id;
}

/** Whether Settings must offer "Privacy options" (GDPR requires it when true). */
export function adPrivacyOptionsRequired(): boolean {
  return privacyOptionsRequired;
}

/** Re-open Google's consent form so the player can change their answer. */
export async function showAdPrivacyOptions(): Promise<void> {
  const g = load();
  if (!g) return;
  try {
    await g.AdsConsent.showPrivacyOptionsForm();
  } catch (err) {
    reportError('ads.privacyOptions', err);
  }
}

async function requestTracking(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- only needed on iOS, after consent
    const att = require('expo-tracking-transparency') as typeof import('expo-tracking-transparency');
    const { status } = await att.getTrackingPermissionsAsync();
    if (status === 'undetermined') await att.requestTrackingPermissionsAsync();
  } catch {
    // No module in this build: ads are served non-personalised, which is fine.
  }
}

/**
 * Consent, tracking, SDK — once per launch, never blocking the game.
 * Resolves false when there will be no ads this session.
 */
export function startAds(): Promise<boolean> {
  const g = load();
  if (!g) return Promise.resolve(false);
  started ??= (async () => {
    try {
      const consent = await g.AdsConsent.gatherConsent();
      privacyOptionsRequired =
        consent.privacyOptionsRequirementStatus === g.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
      if (!consent.canRequestAds) return false;
      await requestTracking();
      await g.default().setRequestConfiguration({
        // A courtroom game rated for teens: no mature advertising.
        maxAdContentRating: g.MaxAdContentRating.T,
        tagForUnderAgeOfConsent: false,
      });
      await g.default().initialize();
      const ids = unitIds(g);
      if (!ids.interstitial && !ids.rewarded) return false;
      setAdBackend(backendFor(g, ids));
      return true;
    } catch (err) {
      reportError('ads.start', err);
      return false;
    }
  })();
  return started;
}

function backendFor(g: Gma, ids: { interstitial: string | null; rewarded: string | null }): AdBackend {
  let interstitial: ReturnType<Gma['InterstitialAd']['createForAdRequest']> | null = null;
  let interstitialReady = false;

  const loadInterstitial = () => {
    if (!ids.interstitial) return;
    interstitialReady = false;
    interstitial = g.InterstitialAd.createForAdRequest(ids.interstitial);
    const off = interstitial.addAdEventListener(g.AdEventType.LOADED, () => {
      interstitialReady = true;
      off();
    });
    interstitial.load();
  };
  loadInterstitial();

  /**
   * Rewarded adverts, preloaded — one per kind of reward, because what the
   * view pays travels inside the ad request (server-side verification). A
   * test advert took twenty-five seconds to arrive on a slow connection; the
   * player tapping WATCH must not be the moment that wait begins.
   */
  type Slot = { ad: ReturnType<Gma['RewardedAd']['createForAdRequest']>; ready: boolean };
  const rewarded: Partial<Record<'merit' | 'case', Slot>> = {};
  const loadRewarded = (reward: 'merit' | 'case') => {
    if (!ids.rewarded || !userId) return;
    const ad = g.RewardedAd.createForAdRequest(ids.rewarded, {
      serverSideVerificationOptions: { userId, customData: reward },
    });
    const slot: Slot = { ad, ready: false };
    const off = ad.addAdEventListener(g.RewardedAdEventType.LOADED, () => {
      slot.ready = true;
      off();
    });
    rewarded[reward] = slot;
    ad.load();
  };
  loadRewarded('merit');
  loadRewarded('case');

  return {
    isReady: async () => true,

    showInterstitial: () =>
      new Promise<boolean>((resolve) => {
        const ad = interstitial;
        if (!ad || !interstitialReady) {
          // Nothing loaded in time: the slot is forfeited, and the next one is
          // fetched for later.
          if (!ad) loadInterstitial();
          resolve(false);
          return;
        }
        const end = (shown: boolean) => {
          offClose();
          offError();
          adCovering(false);
          loadInterstitial();
          resolve(shown);
        };
        const offClose = ad.addAdEventListener(g.AdEventType.CLOSED, () => end(true));
        const offError = ad.addAdEventListener(g.AdEventType.ERROR, () => end(false));
        adCovering(true);
        void ad.show().catch(() => end(false));
      }),

    showRewarded: (reward = 'merit') =>
      new Promise<string | null>((resolve) => {
        const slot = rewarded[reward];
        if (!slot) {
          resolve(null);
          return;
        }
        let earned: string | null = null;
        const subs: (() => void)[] = [];
        let done = false;
        const finish = (v: string | null) => {
          if (done) return;
          done = true;
          clearTimeout(loadTimer);
          subs.forEach((off) => off());
          adCovering(false);
          // The next one starts loading now, so it is ready before it is wanted.
          loadRewarded(reward);
          resolve(v);
        };
        const show = () => {
          clearTimeout(loadTimer);
          adCovering(true);
          void slot.ad.show().catch((err: unknown) => {
            if (__DEV__) console.warn('[ads] rewarded show failed', err);
            finish(null);
          });
        };
        // Only a load still in progress is waited for, and only so long. A
        // network that cannot produce an advert in time has forfeited the
        // slot; the viewing itself is never cut short.
        const loadTimer = setTimeout(() => finish(null), REWARDED_LOAD_MS);
        subs.push(
          slot.ad.addAdEventListener(g.RewardedAdEventType.EARNED_REWARD, () => {
            earned = `view-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          }),
          slot.ad.addAdEventListener(g.AdEventType.CLOSED, () => finish(earned)),
          slot.ad.addAdEventListener(g.AdEventType.ERROR, (err) => {
            if (__DEV__) console.warn('[ads] rewarded error', err);
            finish(null);
          }),
        );
        if (slot.ready) show();
        else subs.push(slot.ad.addAdEventListener(g.RewardedAdEventType.LOADED, show));
      }),
  };
}
