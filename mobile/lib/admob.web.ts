/**
 * AdMob on web: nothing.
 *
 * `lib/admob.ts` already refuses to touch the native module off-device, but a
 * runtime guard cannot help a BUNDLER. Metro collects `require()` calls
 * statically, so it still had to resolve react-native-google-mobile-ads for
 * the web platform — and that package imports
 * `react-native/Libraries/Utilities/codegenNativeComponent`, which does not
 * exist on web. The web build failed before any of our guards could run:
 *
 *   Importing native-only module "…/codegenNativeComponent" on web from:
 *   …/GoogleMobileAdsBannerViewNativeComponent.ts
 *
 * A `.web.ts` sibling is Metro's own answer to this. It resolves first on web,
 * so the native module is never reached by the web bundler at all — no
 * config, no resolver aliases, no dead code shipped to the phone.
 *
 * Every export below matches lib/admob.ts. `startAds` resolves false, which is
 * the same answer a device without the native module gives, and lib/ads then
 * reports no backend — so nothing offers the player an advert that cannot play.
 */

export function setAdUser(_id: string | null): void {}

export function adPrivacyOptionsRequired(): boolean {
  return false;
}

export async function showAdPrivacyOptions(): Promise<void> {}

export async function startAds(): Promise<boolean> {
  return false;
}
