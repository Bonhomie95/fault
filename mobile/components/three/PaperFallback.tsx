import { StyleSheet, View } from 'react-native';

/**
 * The newspaper, drawn in native views instead of triangles.
 *
 * Why this exists: `expo-gl` can hand back a working context that never
 * actually paints. The iOS Simulator is the reproducible case — `onCreated`
 * fires, three initialises, EXGL logs its usual warnings, and the GLView stays
 * completely transparent — but a lost context or a refused surface on a real
 * device ends the same way.
 *
 * That would normally be a cosmetic loss. Here it was total: the masthead and
 * the headline are set in `Palette.bg`, because they are INK, and ink is only
 * legible against paper the 3D layer was supplying. With nothing painted, the
 * front page rendered as a black screen with two invisible headings and a
 * sign-in button floating in the dark. The first screen of the game, unusable,
 * with no error anywhere to explain it.
 *
 * The fix needs no detection, which is the point. An unpainted GLView is
 * transparent, so this sits BEHIND the canvas and simply shows through when
 * there is nothing on top. When GL does work, the scene's own opaque
 * background covers this completely and the screen is pixel-for-pixel what it
 * always was.
 *
 * The proportions come from the settled 3D shot rather than from taste: the
 * sheet is 2.0 x 2.7 at the origin, seen down an 85mm-equivalent 40° lens from
 * z=3.5, resting at -0.92 rad. That projects to a sheet about 64% of the
 * screen tall which overflows it horizontally — hence full bleed, and the
 * rules placed at the fractions below.
 */
export function PaperFallback() {
  return (
    <View style={styles.desk} pointerEvents="none">
      <View style={styles.sheet}>
        {/* One rule, and only one.
            The 3D sheet also carries a second rule and a column gutter, and
            they were faithfully reproduced here at first — which put a hard
            black line through the middle of the word CITY and a vertical one
            down through the sign-in buttons. In the scene those sit BEHIND a
            perspective-projected page and read as furniture; here they land
            on flat native text at whatever height the overlay happens to be,
            and the overlay moves (the entry block is replaced by the name
            field once a provider comes back). Decoration that cannot be
            placed safely in every state does not belong in a fallback. */}
        <View style={styles.mastheadRule} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The desk the paper landed on, matching the scene's clear colour.
  desk: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0D0D0D' },
  sheet: {
    position: 'absolute',
    // Full bleed: at this focal length the 2.0-wide sheet is roughly 1.7x the
    // width of a portrait phone, so its left and right edges are off-screen.
    left: 0,
    right: 0,
    top: '18%',
    height: '64%',
    backgroundColor: '#D8D2C6',
  },
  mastheadRule: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '12%',
    height: 2,
    backgroundColor: '#0D0D0D',
  },
});
