/** Shared visual tokens. Data, gameplay timing and type-size contracts stay centralized. */

export const Palette = {
  bg: '#0D1925',
  surface: '#142535',
  surfaceRaised: '#1A3041',
  surfaceHigh: '#233D4E',
  text: '#F4F1E9',
  textMuted: '#B2C2CA',
  textFaint: '#96ABB7',
  paper: '#D8D2C6',
  paperShadow: '#A9A395',
  hairline: '#294353',
  hairlineBright: '#456171',
} as const;

export const Accents = {
  violent: '#F29180',
  financial: '#BCE8D5',
  systemic: '#85D4C2',
  passion: '#B5ABEA',
} as const;

export const Verdict = {
  guilty: '#F29180',
  notGuilty: '#85D4C2',
  hung: '#8A8A86',
} as const;

export const Fonts = {
  impact: 'PlayfairDisplay_400Regular',
  display: 'PlayfairDisplay_700Bold',
  displayRegular: 'PlayfairDisplay_400Regular',
  ui: 'Inter_500Medium',
  uiBold: 'Inter_700Bold',
  uiBlack: 'Inter_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoBold: 'IBMPlexMono_600SemiBold',
} as const;

export const Type = {
  hero: 44,
  title: 30,
  heading: 22,
  subhead: 18,
  body: 16,
  small: 14,
  label: 12,
  micro: 11,
} as const;

export const IMPACT_LEADING = 1.19;

export const MIN_FONT_SIZE = Type.micro;

export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const Elevation = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  raised: {
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
} as const;

export const Clock = {
  tensionAt: 15,
  hapticAt: 5,
  defaultSeconds: 120,
} as const;

export const Layout = {
  radius: Radius.md,
  gutter: Space.xl,
  touchMin: 44,
} as const;
