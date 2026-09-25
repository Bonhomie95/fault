const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Two pod build settings this project cannot live without, applied in the
 * Podfile's post_install so `expo prebuild` cannot throw them away.
 *
 * 1. IPHONEOS_DEPLOYMENT_TARGET on every pod target, resource bundles included.
 *
 * expo-build-properties sets it on the pods themselves but not on the
 * generated `*-*Resources` bundle targets, and Xcode 26 refuses to build any
 * target below iOS 15 — so Google Mobile Ads (12.0), SDWebImage (9.0) and
 * RNSVG's filters (12.4) fail the build even though the app itself is fine.
 *
 * Metro's port is NOT settable here, and it is worth writing down why, because
 * React-Core's xcconfig looks like it should be: it compiles
 * `RCT_METRO_PORT=${RCT_METRO_PORT}`. This project consumes React Native core
 * as a PREBUILT xcframework (`RCT_USE_PREBUILT_RNCORE=1`, set in the Podfile
 * whenever the new architecture is on), so RCTBundleURLProvider.mm is compiled
 * upstream with the default 8081 and nothing local reaches it. A debug build
 * therefore always looks for Metro on **localhost:8081** — see TESTING.md.
 */
const TARGET = '15.1';
const MARKER = '# fault: pod build settings';

module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const src = fs.readFileSync(podfile, 'utf8');
      // Guard on a marker, not on one of the settings: `expo prebuild` keeps an
      // existing Podfile, so a guard that matched the FIRST setting silently
      // skipped every later addition to this block.
      if (src.includes(MARKER)) return cfg;

      const bump = `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        current = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${TARGET}')
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${TARGET}'
        end
      end
    end
`;
      // Last thing in post_install, so nothing downstream lowers it again.
      const anchor = '    )\n  end\nend';
      if (!src.includes(anchor)) {
        throw new Error('withPodBuildSettings: post_install block not found in Podfile');
      }
      fs.writeFileSync(podfile, src.replace(anchor, `    )\n${bump}  end\nend`));
      return cfg;
    },
  ]);
