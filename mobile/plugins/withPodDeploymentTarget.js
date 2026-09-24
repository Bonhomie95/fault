const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Raise IPHONEOS_DEPLOYMENT_TARGET on every pod target, resource bundles
 * included.
 *
 * expo-build-properties sets it on the pods themselves but not on the
 * generated `*-*Resources` bundle targets, and Xcode 26 refuses to build any
 * target below iOS 15 — so Google Mobile Ads (12.0), SDWebImage (9.0) and
 * RNSVG's filters (12.4) fail the build even though the app itself is fine.
 *
 * This belongs in a plugin rather than the Podfile because `expo prebuild`
 * regenerates the Podfile and would throw the fix away.
 */
const TARGET = '15.1';

module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const src = fs.readFileSync(podfile, 'utf8');
      if (src.includes('IPHONEOS_DEPLOYMENT_TARGET')) return cfg;

      const bump = `
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
        throw new Error('withPodDeploymentTarget: post_install block not found in Podfile');
      }
      fs.writeFileSync(podfile, src.replace(anchor, `    )\n${bump}  end\nend`));
      return cfg;
    },
  ]);
