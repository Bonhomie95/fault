import type { WebGLRenderer } from 'three';

/**
 * Is this GL context one our scenes can actually be drawn on?
 *
 * `expo-gl` will hand back a context that looks healthy — WebGL2, highp,
 * 4096 textures, `onCreated` fires, `useFrame` ticks at a clean 60fps — and
 * still fail to put our scenes on the screen. The iOS Simulator is the
 * reproducible case. What it is missing is `EXT_color_buffer_float`, and the
 * things that break without it do not break politely:
 *
 *   - `<Canvas shadows>` takes every lit surface down with it. Not the
 *     shadows: the surfaces. The page rendered as a black rectangle.
 *   - `meshStandardMaterial` on a box shaded its two front triangles
 *     differently and left half the sheet black along the diagonal.
 *   - Frames presented out of step with what the scene graph actually held.
 *
 * None of it raises. There is no error, no warning beyond two unrelated
 * deprecations, and nothing in the console to connect a black screen to a
 * missing extension. That is what makes this worth a named check rather than a
 * defensive tweak at each call site.
 *
 * Every iOS and Android device that reports WebGL2 also reports this
 * extension, so on real hardware `usable` is true and the scenes run exactly
 * as written. Where it is false we do not try to degrade the 3D — we stop
 * drawing it and let the scene's native fallback stand in, because a scene
 * that renders half a page is worse than one that renders a clean flat one.
 */
export function glUsable(gl: WebGLRenderer): boolean {
  const ok = gl.extensions.has('EXT_color_buffer_float');
  return ok;
}
