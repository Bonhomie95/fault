/**
 * FAULT — art direction.
 *
 * A legal thriller, not a terminal readout. The room is still dark and there is
 * still exactly one accent per case, chosen by the case's mood rather than by
 * the player (GDD 5.1). No light mode: the room has no windows.
 *
 * What changed: this used to be four colours, five fonts and `radius: 2`, with
 * a comment explaining that documents have corners and not curves. That was a
 * principle standing in for a design system, and the result read like a
 * terminal — every button was literally a monospace label between two square
 * brackets. Type, spacing, elevation and shape are systems now, not opinions.
 */

export const Palette = {
  /** near-black — the room. Not #000: OLED smears on true black. */
  bg: '#0B0B0C',
  /** raised surfaces, in order. A card must read as a card. */
  surface: '#141416',
  surfaceRaised: '#1C1C1F',
  surfaceHigh: '#26262A',
  /** off-white — primary type */
  text: '#F4F2EF',
  /** warm grey — muted type */
  textMuted: '#9A9A96',
  textFaint: '#5C5C58',
  /** paper, for the newspaper and letter surfaces that really are paper */
  paper: '#D8D2C6',
  paperShadow: '#A9A395',
  hairline: '#2E2E33',
  hairlineBright: '#3E3E45',
} as const;

/** GDD 5.1 — accent by case mood. */
export const Accents = {
  violent: '#E04E2E',
  financial: '#F0A020',
  systemic: '#1FA184',
  passion: '#8A6BE0',
} as const;

/**
 * Verdict colour.
 *
 * Semantic and separate from the case accent, because they answer different
 * questions and must never be confused: the accent is what KIND of case this
 * is, this is what YOU decided. Never the only signal — every use is paired
 * with a word, since roughly one man in twelve cannot tell these two apart.
 */
export const Verdict = {
  guilty: '#E04E2E',
  notGuilty: '#1FA184',
  hung: '#8A8A86',
} as const;

export const Fonts = {
  /**
   * Impact. Anton is one weight, condensed, and shouts — which is the point.
   * Headlines and verdicts only; it is unreadable as body text and must never
   * be used below ~16px or for more than a few words.
   */
  impact: 'Anton_400Regular',
  /** newspaper authority — the masthead, the Chief Justice's letter. Real paper only. */
  display: 'PlayfairDisplay_700Bold',
  displayRegular: 'PlayfairDisplay_400Regular',
  /** UI and body. Archivo shares Anton's skeleton, so they sit together. */
  ui: 'Archivo_500Medium',
  uiBold: 'Archivo_700Bold',
  uiBlack: 'Archivo_600SemiBold',
  /**
   * Data only: clocks, scores, case numbers, anything in a column.
   * Tabular by construction — a timer in a proportional face jitters every
   * time a 1 replaces a 0, which at 120s is 120 visible twitches.
   */
  mono: 'IBMPlexMono_400Regular',
  monoBold: 'IBMPlexMono_600SemiBold',
} as const;

/**
 * Type scale.
 *
 * Every size in the app comes from here. Scaled at the point of use by the
 * player's text-size setting where the content is prose.
 *
 * It said that before and it was not true. The scale existed and one component
 * used it; the screens carried 145 raw `fontSize:` literals between them, and
 * `case.tsx` alone had 23 — 8, 8.5, 9, 10, 12.5, 15, 17, 19. Labels, tags,
 * timings and jurisdiction lines were running at 8-10pt in warm grey on
 * near-black, with heavy letter-spacing, read under a 120-second clock.
 *
 * iOS's smallest standard text style is 11pt. `micro` is now that floor rather
 * than a suggestion, and nothing in the app is allowed below it. The eslint
 * rule in eslint.config.js keeps new literals from creeping back.
 */
export const Type = {
  hero: 44,
  title: 30,
  heading: 22,
  subhead: 18,
  body: 16,
  small: 14,
  label: 12,
  /**
   * The floor. Was 10, and the screens went to 8.
   *
   * Reserved for uppercase mono labels with letter-spacing — never for prose,
   * and never for anything a player has to read quickly.
   */
  micro: 11,
} as const;

/**
 * The tightest leading Anton can be set at without losing its own capitals.
 *
 * Taken from the font, not from taste. Anton_400Regular is 2048 units/em with
 * a capHeight of 1760 (0.859em) and a typo descender of 674 (0.329em). iOS
 * puts the baseline `lineHeight - descent` below the top of the line box and
 * clips anything above it, so the smallest leading that still clears a capital
 * is (1760 + 674) / 2048 = 1.1885.
 *
 * The screens were asking for `Type.hero * 0.92`. That is not merely tight,
 * it is a quarter of an em inside the capitals, and the top was sliced off
 * every display heading in the game — the lobby read "CASE / DOCKET" with all
 * four letters of CASE cut through, and the docket card did the same to
 * "A CASE FILE / IS WAITING". Only ever the FIRST line, which is what makes it
 * read as a rendering fault rather than a leading value somebody chose.
 *
 * Anton's own natural line is 1.505, so 1.19 is still far tighter than the
 * face asks for: the headings keep their stacked, poster-like setting. They
 * just keep their letters as well.
 */
export const IMPACT_LEADING = 1.19;

/**
 * The smallest size any text in this app may use.
 *
 * Exported so it can be asserted rather than merely intended.
 */
export const MIN_FONT_SIZE = Type.micro;

/** 4pt rhythm. Nothing in the app may invent its own spacing. */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Shape.
 *
 * The old value was 2, on the theory that documents have square corners. True
 * of documents; this is a game about documents, and the difference matters.
 */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

/**
 * Elevation.
 *
 * iOS shadows and Android elevation from one place, so a card cannot be raised
 * on one platform and flat on the other.
 */
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

/**
 * GDD 2.2 — the clock's escalation points, in seconds remaining.
 *
 * `defaultSeconds` is display only: the real clock lives on the server
 * (server/src/domain/clock.ts) and every case arrives carrying how much of it
 * is left. This is the fallback for the split second before that lands.
 */
export const Clock = {
  /** low ambient tension tone begins */
  tensionAt: 15,
  /** haptic pulse every second */
  hapticAt: 5,
  /** The one window. Mirrors CLOCK_SECONDS on the server. */
  defaultSeconds: 120,
} as const;

export const Layout = {
  radius: Radius.md,
  gutter: Space.xl,
  /** Apple HIG minimum. Nothing tappable may be smaller. */
  touchMin: 44,
} as const;
