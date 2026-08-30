/**
 * Babel needs one plugin that babel-preset-expo does not ship.
 *
 * three@0.185 is written with static initialisation blocks (`static { ... }`).
 * Hermes' parser handles them, but Metro transforms first, and without this
 * plugin the transform fails outright:
 *
 *   node_modules/three/build/three.cjs: Static class blocks are not enabled.
 *
 * A transform error is not a red screen — Metro returns 500 for the whole
 * bundle, so the app shows a white one and says nothing. This project had no
 * babel config at all, which meant a clean checkout could not build the client
 * and the only symptom was a blank screen.
 *
 * three is not optional here: the front page (NewspaperScene) and the lobby
 * (CityScene) are both r3f. Dropping the dependency would mean dropping them.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@babel/plugin-transform-class-static-block'],
  };
};
