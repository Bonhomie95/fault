/**
 * app.json plus the parts that differ per build.
 *
 * AdMob's app ids live in the native project, so they are set at build time
 * from the environment (eas.json / EAS secrets). Without them a build gets
 * Google's public TEST app ids — which is right for development, and the
 * app's ad units are separately gated (lib/admob) so a release build without
 * real ids serves no ads at all rather than test ads to the public.
 */
/**
 * Google's published SKAdNetwork identifiers
 * (developers.google.com/admob/ios/3p-skadnetworks). Without them iOS
 * attribution fails and Google warns that ads may fill less.
 */
const SKAD_NETWORKS = [
  '22mmun2rn5.skadnetwork',
  '2fnua5tdw4.skadnetwork',
  '2u9pt9hc89.skadnetwork',
  '3qcr597p9d.skadnetwork',
  '3qy4746246.skadnetwork',
  '3rd42ekr43.skadnetwork',
  '3sh42y64q3.skadnetwork',
  '4468km3ulz.skadnetwork',
  '44jx6755aq.skadnetwork',
  '47vhws6wlr.skadnetwork',
  '4dzt52r2t5.skadnetwork',
  '4fzdc2evr5.skadnetwork',
  '578prtvx9j.skadnetwork',
  '7ug5zh24hu.skadnetwork',
  '8c4e2ghe7u.skadnetwork',
  '8s468mfl3y.skadnetwork',
  '97r2b46745.skadnetwork',
  '9t245vhmpl.skadnetwork',
  'a2p9lx4jpn.skadnetwork',
  'c3frkrj4fj.skadnetwork',
  'c6k4g5qg8m.skadnetwork',
  'cp8zw746q7.skadnetwork',
  'cstr6suwn9.skadnetwork',
  'e5fvkxwrpn.skadnetwork',
  'f38h382jlk.skadnetwork',
  'gta9lk7p23.skadnetwork',
  'hs6bdukanm.skadnetwork',
  'k674qkevps.skadnetwork',
  'kbd757ywx3.skadnetwork',
  'kbmxgpxpgc.skadnetwork',
  'klf5c3l5u5.skadnetwork',
  'ludvb6z3bs.skadnetwork',
  'mlmmfzh3r3.skadnetwork',
  'n38lu8286q.skadnetwork',
  'p78axxw29g.skadnetwork',
  'ppxm28t8ap.skadnetwork',
  's39g8k73mm.skadnetwork',
  'su67r6k2v3.skadnetwork',
  't38b2kh725.skadnetwork',
  'tl55sbb4fm.skadnetwork',
  'uw77j35x4d.skadnetwork',
  'v4nxqhlyqp.skadnetwork',
  'v72qych5uu.skadnetwork',
  'v9wttpbfk9.skadnetwork',
  'vutu7akeur.skadnetwork',
  'wg4vff78zm.skadnetwork',
  'wzmmz9fp6w.skadnetwork',
  'y5ghdn5j9k.skadnetwork',
  'yclnxrl5pm.skadnetwork',
  'ydx93a7ass.skadnetwork',
];

const TEST_APP_IDS = {
  ios: 'ca-app-pub-3940256099942544~1458002511',
  android: 'ca-app-pub-3940256099942544~3347511713',
};

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...config.plugins,
    [
      // Xcode 26 refuses to build a target whose deployment target is below
      // iOS 15, and several pods (Google Mobile Ads' resource bundle, SDWebImage,
      // RNSVG's filters) still ship 9.0–12.4. Setting it here rather than in the
      // Podfile means `expo prebuild` cannot throw the fix away.
      'expo-build-properties',
      { ios: { deploymentTarget: '15.1' } },
    ],
    // ...and the same for the resource-bundle targets it does not reach.
    './plugins/withPodBuildSettings',
    // Google's reversed-client-id redirect schemes, appended to Info.plist
    // rather than added to `scheme` (which confuses expo-linking).
    './plugins/withGoogleSignInScheme',
    // iOS 27's SDK refuses to launch an app that has not adopted UIScene.
    './plugins/withUISceneLifecycle',
    [
      'react-native-google-mobile-ads',
      {
        iosAppId: process.env.ADMOB_IOS_APP_ID || TEST_APP_IDS.ios,
        androidAppId: process.env.ADMOB_ANDROID_APP_ID || TEST_APP_IDS.android,
        // Nothing is measured before the consent form has been answered.
        delayAppMeasurementInit: true,
        skAdNetworkItems: SKAD_NETWORKS,
      },
    ],
  ],
});
