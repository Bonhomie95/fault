/**
 * FAULT — art direction (GDD 5.1).
 *
 * Stark monochrome with exactly one accent per case. The accent is never
 * chosen by the player; it is chosen by the case's mood and arrives with the
 * dossier. Everything here is deliberately dark: FAULT has no light mode,
 * because the room has no windows.
 */

export const Palette = {
  /** near-black — the room */
  bg: '#0D0D0D',
  /** the desk surface, one step up from the void */
  surface: '#151513',
  surfaceRaised: '#1C1C19',
  /** off-white — primary type */
  text: '#F0EDE8',
  /** warm grey — muted type */
  textMuted: '#888880',
  textFaint: '#4A4A45',
  /** paper, for dossier stock */
  paper: '#D8D2C6',
  paperShadow: '#A9A395',
  hairline: '#2A2A26',
} as const;

/** GDD 5.1 — accent by case mood. */
export const Accents = {
  violent: '#C23B22',
  financial: '#D4860A',
  systemic: '#1D7E6A',
  passion: '#6B4FBB',
} as const;

export const Fonts = {
  /** newspaper authority */
  display: 'PlayfairDisplay_700Bold',
  displayRegular: 'PlayfairDisplay_400Regular',
  /** dossier / typewriter */
  mono: 'IBMPlexMono_400Regular',
  monoBold: 'IBMPlexMono_600SemiBold',
  /** clean, readable under pressure */
  ui: 'Inter_500Medium',
  uiBold: 'Inter_700Bold',
} as const;

/** GDD 2.2 — the clock's escalation points, in seconds remaining. */
export const Clock = {
  /** low ambient tension tone begins */
  tensionAt: 15,
  /** haptic pulse every second */
  hapticAt: 5,
  /** default deliberation window (GDD 2.1) */
  defaultSeconds: 120,
  /** accessibility tiers — no penalty, no badge change (GDD 8, 12) */
  accessibleTiers: [120, 180, 240] as const,
} as const;

export const Layout = {
  radius: 2, // documents have corners, not curves
  gutter: 20,
} as const;
