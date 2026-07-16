/**
 * react-three-fiber, web entry.
 *
 * The web build renders to a DOM canvas and drives its own rAF loop. The
 * /native entry expects expo-gl to pump frames, which does not happen in the
 * browser — it initialises three and then paints nothing. Web is a preview
 * surface for this game, not a shipping target, but a preview that renders
 * black is worthless.
 *
 * See r3f.ts for the native twin.
 */
export { Canvas, useFrame, useThree } from '@react-three/fiber';
