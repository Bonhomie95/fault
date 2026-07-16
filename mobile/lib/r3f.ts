/**
 * react-three-fiber, native entry (iOS + Android).
 *
 * Every scene imports r3f through this shim rather than reaching for the
 * package directly. The native and web builds of react-three-fiber are
 * separate modules with separate reconcilers and separate context objects —
 * mixing them (Canvas from one, useFrame from the other) yields hooks that
 * silently resolve against the wrong store. Routing all of it through one
 * platform-resolved file makes that impossible.
 *
 * The web twin lives in r3f.web.ts; Metro picks by platform extension.
 */
export { Canvas, useFrame, useThree } from '@react-three/fiber/native';
