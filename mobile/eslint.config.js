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
  {
    /**
     * The type scale, enforced.
     *
     * constants/theme.ts has defined a scale, a spacing rhythm and a 44pt
     * minimum touch target since the design system landed. Exactly one
     * component used any of it. The screens carried 145 raw `fontSize:`
     * literals between them, and 46 of those were BELOW 11pt — labels, tags,
     * timings and jurisdiction lines at 8 and 9 points, in warm grey on
     * near-black, read under a 120-second clock.
     *
     * A design system that is documented and not enforced is a style guide,
     * and style guides lose. This rule is what makes the scale real: it is not
     * about tidiness, it is the accessibility floor.
     *
     * `no-restricted-syntax` rather than a custom rule so it needs no plugin
     * and no build step — the selector matches a numeric literal assigned to a
     * fontSize property, which is exactly the thing that regressed.
     */
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='fontSize'] > Literal[value<11]",
          message:
            'Text below 11pt is below the iOS minimum and is unreadable under the clock. Use Type.micro (the floor) or a larger step from constants/theme.',
        },
      ],
    },
  },
]);
