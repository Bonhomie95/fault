import type { RoomTheme } from '@/lib/api';

/**
 * The courtroom's finishes — what the room cosmetics actually change.
 *
 * Wood, stone, light. Never the people, never the evidence, never how anything
 * is framed: a theme is the same room at a different hour or in a different
 * building, and it must read nothing into the case. The accent colour of the
 * case still washes the back wall on top of every theme.
 */
export interface RoomPalette {
  /** Shown in the store, left to right: wall, wood, light. */
  swatch: readonly string[];
  base: string;
  wallTop: string;
  wallBottom: string;
  /** Panel seams on the back wall. */
  seam: string;
  seamOpacity: number;
  galleryBack: string;
  galleryFront: string;
  galleryHead: string;
  galleryBody: string;
  benchBody: string;
  benchTop: string;
  /** The light on the accused. */
  spot: string;
  spotOpacity: number;
  woodTop: string;
  woodBottom: string;
  woodDarkTop: string;
  woodDarkBottom: string;
  tableRail: string;
  boxRail: string;
  dockRail: string;
  exhibitTop: string;
  exhibitBody: string;
  /** Tall windows behind the gallery (the night session). */
  windows?: { color: string; opacity: number };
}

const standard: RoomPalette = {
  swatch: ['#15130F', '#2B2418', '#FFF4E4'],
  base: '#0D0D0D',
  wallTop: '#15130F',
  wallBottom: '#0D0D0C',
  seam: '#000000',
  seamOpacity: 0.35,
  galleryBack: '#101013',
  galleryFront: '#141417',
  galleryHead: '#1C1C22',
  galleryBody: '#181820',
  benchBody: '#121210',
  benchTop: '#17170F',
  spot: '#FFF4E4',
  spotOpacity: 0.16,
  woodTop: '#2B2418',
  woodBottom: '#15120C',
  woodDarkTop: '#1E1A12',
  woodDarkBottom: '#0E0D0A',
  tableRail: '#2E271B',
  boxRail: '#3A3122',
  dockRail: '#3F3525',
  exhibitTop: '#26261F',
  exhibitBody: '#131311',
};

export const THEMES: Record<'standard' | RoomTheme, RoomPalette> = {
  standard,
  room_oak: {
    ...standard,
    swatch: ['#2A1A0E', '#5A3A1C', '#FFD9A0'],
    wallTop: '#2A1A0E',
    wallBottom: '#140C06',
    seamOpacity: 0.5,
    galleryBack: '#1A120A',
    galleryFront: '#20160C',
    galleryHead: '#2A1E12',
    galleryBody: '#241A10',
    benchBody: '#2C1C0E',
    benchTop: '#3A2612',
    spot: '#FFD9A0',
    spotOpacity: 0.2,
    woodTop: '#5A3A1C',
    woodBottom: '#2A1A0C',
    woodDarkTop: '#3E2812',
    woodDarkBottom: '#1C1208',
    tableRail: '#6A4522',
    boxRail: '#7A5028',
    dockRail: '#80552A',
    exhibitTop: '#4A3018',
    exhibitBody: '#24180C',
  },
  room_marble: {
    ...standard,
    swatch: ['#4A4845', '#6E6A64', '#F4F7FF'],
    base: '#1A1A1A',
    wallTop: '#4A4845',
    wallBottom: '#262523',
    seam: '#FFFFFF',
    seamOpacity: 0.08,
    galleryBack: '#2A2A2B',
    galleryFront: '#323234',
    galleryHead: '#3C3C40',
    galleryBody: '#36363A',
    benchBody: '#3E3C38',
    benchTop: '#5A5751',
    spot: '#F4F7FF',
    spotOpacity: 0.2,
    woodTop: '#6E6A64',
    woodBottom: '#3A3834',
    woodDarkTop: '#55524D',
    woodDarkBottom: '#2A2926',
    tableRail: '#8A857C',
    boxRail: '#98938A',
    dockRail: '#A39E94',
    exhibitTop: '#5E5B55',
    exhibitBody: '#2E2D2A',
  },
  room_concrete: {
    ...standard,
    swatch: ['#2C2F2F', '#3E4242', '#E6FFF4'],
    base: '#121414',
    wallTop: '#2C2F2F',
    wallBottom: '#171919',
    seam: '#000000',
    seamOpacity: 0.25,
    galleryBack: '#1C1F1F',
    galleryFront: '#212424',
    galleryHead: '#2A2E2E',
    galleryBody: '#262A2A',
    benchBody: '#262929',
    benchTop: '#323636',
    spot: '#E6FFF4',
    spotOpacity: 0.14,
    woodTop: '#3E4242',
    woodBottom: '#222525',
    woodDarkTop: '#303333',
    woodDarkBottom: '#181A1A',
    tableRail: '#4E5353',
    boxRail: '#565B5B',
    dockRail: '#5C6161',
    exhibitTop: '#3A3E3E',
    exhibitBody: '#1C1E1E',
  },
  room_night: {
    ...standard,
    swatch: ['#0C1424', '#1E1A14', '#7FA8FF'],
    base: '#05070C',
    wallTop: '#0C1424',
    wallBottom: '#06080E',
    seamOpacity: 0.45,
    galleryBack: '#080B12',
    galleryFront: '#0B0E16',
    galleryHead: '#121724',
    galleryBody: '#0F131E',
    benchBody: '#0E0E10',
    benchTop: '#15140F',
    spot: '#FFE2A8',
    spotOpacity: 0.18,
    woodTop: '#241E15',
    woodBottom: '#100D08',
    woodDarkTop: '#18140E',
    woodDarkBottom: '#0A0806',
    tableRail: '#2A2318',
    boxRail: '#332A1D',
    dockRail: '#382E20',
    exhibitTop: '#1E1D19',
    exhibitBody: '#0C0C0A',
    windows: { color: '#7FA8FF', opacity: 0.1 },
  },
};

/** The room to draw: the equipped one while it is owned, standard otherwise. */
export function roomFor(equipped: RoomTheme | null, owned: readonly string[]): RoomPalette {
  return equipped && owned.includes(equipped) ? THEMES[equipped] : standard;
}
