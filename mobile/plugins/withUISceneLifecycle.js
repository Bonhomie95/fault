const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * Adopt the UIKit scene life cycle, which the iOS 27 SDK requires.
 *
 * Built with Xcode 27, an app that still creates its window in
 * `application(_:didFinishLaunchingWithOptions:)` is killed at launch:
 *
 *   _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption:
 *   Application failed to launch: UIScene life cycle is required for apps
 *   built with this SDK.
 *
 * It surfaces in Xcode as `Thread 1: EXC_BREAKPOINT` on the `AppDelegate`
 * line, which points at nothing useful. Note it only fires on iOS 27 — an
 * iOS 26 simulator runs the same binary happily, so this hides from anyone
 * testing on an older simulator and appears the moment a real device updates.
 *
 * Expo SDK 54 has not done this yet: `ExpoAppDelegate.swift` carries a literal
 * `// TODO: - Configuring and Discarding Scenes`, 54.0.37 is the last patch on
 * that line, and there is no Xcode 26 on this machine to fall back to. So the
 * app adopts scenes itself, here, where `expo prebuild` cannot overwrite it.
 *
 * What changes: the window is built from the UIWindowScene and React Native is
 * started there instead of in `didFinishLaunching`. URL opens and user
 * activities are forwarded back into the app delegate, because under scenes
 * UIKit stops calling those app-delegate methods — and Expo's subscriber chain
 * (deep links, and the Google OAuth redirect this app's sign-in depends on)
 * hangs off exactly those methods.
 *
 * Revisit when Expo ships scene support; this plugin should then be deleted
 * rather than maintained.
 */

const MARKER = '// fault: UIScene life cycle';

const SCENE_DELEGATE = `

${MARKER}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Expo modules and React Native both still read the app delegate's window.
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)

    // A cold start opened BY a link delivers it here, not through the app
    // delegate — this is the OAuth redirect coming back into a app that was
    // not already running.
    if let url = connectionOptions.urlContexts.first?.url {
      _ = UIApplication.shared.delegate?.application?(UIApplication.shared, open: url, options: [:])
    }
    for activity in connectionOptions.userActivities {
      _ = UIApplication.shared.delegate?.application?(
        UIApplication.shared,
        continue: activity,
        restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    _ = UIApplication.shared.delegate?.application?(UIApplication.shared, open: url, options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = UIApplication.shared.delegate?.application?(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in })
  }
}
`;

const START_IN_DID_FINISH_LAUNCHING = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

const withSwift = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    if (!cfg.modResults.contents.includes(START_IN_DID_FINISH_LAUNCHING)) {
      throw new Error(
        'withUISceneLifecycle: AppDelegate.swift does not look the way this plugin expects. ' +
          'Expo probably changed its template — re-check whether scene support has landed upstream.',
      );
    }

    cfg.modResults.contents = cfg.modResults.contents
      // The window now belongs to the scene, so keep the launch options for it.
      .replace(
        '  var window: UIWindow?',
        '  var window: UIWindow?\n  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?',
      )
      .replace(
        START_IN_DID_FINISH_LAUNCHING,
        `    // React Native starts in SceneDelegate.scene(_:willConnectTo:options:),\n` +
          `    // which is the only place a UIWindowScene exists to attach it to.\n` +
          `    self.launchOptions = launchOptions`,
      )
      .concat(SCENE_DELEGATE);

    return cfg;
  });

const withPlist = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            // Xcode substitutes the build setting; the class is in the app target.
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

module.exports = (config) => withPlist(withSwift(config));
