// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // react-three-fiber renders three.js objects through JSX, so <mesh>,
    // <ambientLight> and friends take props that react/no-unknown-property has
    // never heard of — position, intensity, args, attach. All 223 warnings this
    // rule produced here were wrong, and between them they buried the two that
    // were real. A linter nobody reads is not a linter.
    //
    // Scoped to the 3D components deliberately: everywhere else the rule still
    // catches genuine typos.
    files: ['components/three/**/*.tsx'],
    rules: { 'react/no-unknown-property': 'off' },
  },
]);
