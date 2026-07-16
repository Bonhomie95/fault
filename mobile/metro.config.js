// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

/**
 * Force a single instance of three.js.
 *
 * three ships both a CJS and an ESM build and selects between them with an
 * exports map. @react-three/fiber's react-native entry is CJS and `require`s
 * three.cjs; our own `import ... from 'three'` resolves the "import"
 * condition and gets three.module.js. That loads the library twice, which
 * three itself warns about ("Multiple instances of Three.js being imported")
 * and which quietly breaks every cross-instance `instanceof` — a Vector3 we
 * construct is not r3f's Vector3.
 *
 * Pinning the specifier to the CJS build is what r3f's own runtime uses, so
 * everything ends up on one instance.
 */
const THREE_CJS = path.resolve(__dirname, 'node_modules/three/build/three.cjs');

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: THREE_CJS };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
