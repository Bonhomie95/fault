const { AndroidConfig, withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

/**
 * Register Google's reversed-client-id URL schemes on iOS.
 *
 * Google's OAuth redirect for an installed app is the client id with its
 * dot-separated parts reversed, used as a URL scheme — `fault://` is ours and
 * Google refuses it — so the scheme has to exist in Info.plist or the sheet
 * never comes back.
 *
 * This used to be done by making the app's top-level `scheme` an ARRAY. It
 * worked natively and broke something else: expo-linking picks the app's
 * scheme from that same list, found four candidates, and warned on every
 * launch —
 *
 *   Linking found multiple possible URI schemes in your Expo config.
 *   Using 'fault'. Ignoring: com.googleusercontent.apps…, com.bonhomie95.fault.
 *
 * It happened to guess right, but "happened to guess right" is not a deep
 * link strategy. `scheme` stays a single string so Linking has exactly one
 * answer, and the Google schemes are appended to Info.plist here instead,
 * where only the OAuth redirect looks for them.
 *
 * Android gets the same scheme as its own intent filter. Google currently
 * refuses custom URI schemes for Android OAuth clients until "Enable Custom
 * URI scheme" is ticked in the Google Cloud console (see TESTING.md), but the
 * manifest has to be ready for the day that is flipped — and the array form
 * this replaced did register it, so dropping it would have been a silent
 * regression.
 *
 * The ids come from the same environment variables lib/auth reads, so the
 * native side and the JS side cannot disagree about what the redirect is.
 */

const reversed = (id) =>
  id ? `com.googleusercontent.apps.${id.replace('.apps.googleusercontent.com', '')}` : null;

const schemesFromEnv = () =>
  [
    reversed(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS),
    reversed(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID),
  ].filter(Boolean);

const withIos = (config) =>
  withInfoPlist(config, (cfg) => {
    const schemes = schemesFromEnv();
    if (!schemes.length) return cfg;

    const types = (cfg.modResults.CFBundleURLTypes ??= []);
    // Append, never replace: Expo has already written the app's own scheme and
    // its bundle-identifier scheme into this array by the time we run.
    const known = new Set(types.flatMap((t) => t.CFBundleURLSchemes ?? []));
    const missing = schemes.filter((s) => !known.has(s));
    if (missing.length) types.push({ CFBundleURLSchemes: missing });

    return cfg;
  });

const withAndroid = (config) =>
  withAndroidManifest(config, (cfg) => {
    const android = reversed(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID);
    if (!android) return cfg;

    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const filters = (activity['intent-filter'] ??= []);
    const already = filters.some((f) =>
      (f.data ?? []).some((d) => d.$?.['android:scheme'] === android),
    );
    if (already) return cfg;

    filters.push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [
        { $: { 'android:name': 'android.intent.category.DEFAULT' } },
        { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
      ],
      data: [{ $: { 'android:scheme': android } }],
    });

    return cfg;
  });

module.exports = (config) => withAndroid(withIos(config));
