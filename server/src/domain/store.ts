import type { Entitlement } from '@prisma/client';

/**
 * What money and Merit can buy.
 *
 * THE RULE, and it is the whole design: nothing in this file may touch rank,
 * trust, a verdict, the evidence, or the clock. Not one item. FAULT is a game
 * about whether your judgement can be trusted — the moment a wallet can move
 * standing, the answer is "no, and everyone knows it", and the Juror Record
 * becomes a receipt instead of a mirror.
 *
 * So the store sells exactly three kinds of thing:
 *   - MORE GAME     (an unlimited docket, special dockets, extra cases today)
 *   - LESS FRICTION (no ads, streak shields)
 *   - HOW IT LOOKS  (seals, courtrooms)
 *
 * — alone, bundled, or all at once as the Juror Pass — and never BETTER
 * OUTCOMES.
 *
 * Everything with a Merit price is genuinely reachable by playing — Merit is
 * paid for service, so a player who never spends a penny still gets there.
 * Money buys the same thing sooner. That is the only difference, deliberately.
 */

export interface Sku {
  id: string;
  title: string;
  blurb: string;
  /** Minor units, USD — a fallback label only; the app shows the store's own
   *  localised price. Null = not for sale for money. */
  priceMinor: number | null;
  /** Null = not earnable, money only. */
  meritPrice: number | null;
  /** What owning it grants. Empty for consumables. */
  grants: Entitlement[];
  /** Merit granted on purchase. */
  meritGranted?: number;
  /** Streak shields granted on purchase. */
  shieldsGranted?: number;
  /** Extra cases opened today (Merit only). */
  casesGranted?: number;
  kind: 'pass' | 'bundle' | 'unlock' | 'pack' | 'currency' | 'consumable' | 'cosmetic' | 'support';
  /**
   * How the platform store sells it: a one-off product, a consumable (bought
   * again and again — the store must be told to consume it), or an
   * auto-renewing subscription. Null = Merit only.
   */
  store: 'nonconsumable' | 'consumable' | 'subscription' | null;
  /** Subscription period, for the terms line Apple and Google require. */
  period?: 'month' | 'year';
  /** A short tag on the card. Facts only — never a fake countdown. */
  badge?: string;
  /** Offered only to new jurors, once. See STARTER_WINDOW_HOURS. */
  starter?: boolean;
}

/**
 * The docket.
 *
 * FREE TO PLAY, EVERY DAY. It used to be a ten-case trial and then a wall: a
 * player who liked the game on Monday met a paywall on Tuesday, and most
 * people who meet a wall on day two uninstall rather than pay. Now every
 * juror gets a docket every day, for ever; more cases the same day are a
 * rewarded view or a little Merit away; and "unlimited" is what money buys.
 *
 * Nothing about judgement is for sale — only how MUCH of the game you can
 * play today.
 */
export const DOCKET = {
  freePerDay: 6,
  /** Extra cases a rewarded view can open, per day. */
  adCasesPerDay: 3,
  /** Cases a themed special docket holds. */
  packCases: 10,
} as const;

/** Kept for old clients and tests: the free docket, per day. */
export const CAMPAIGN_TRIAL_CASES = DOCKET.freePerDay;

/** How long after swearing in the starter bundle is offered. */
export const STARTER_WINDOW_HOURS = 72;

/**
 * What the Juror Pass includes while it is live. The pass row expires; these
 * are implied by it and never written, so they lapse with it.
 */
export const PASS_INCLUDES: Entitlement[] = [
  'campaign',
  'no_ads',
  'seal_gold',
  'room_oak',
  'room_concrete',
  'room_marble',
  'room_night',
  'pack_corporate',
  'pack_cold_case',
  'pack_political',
];

/** Merit multiplier on cases for pass holders. Merit only — never XP, never rank. */
export const PASS_MERIT_MULTIPLIER = 1.5;
/** Shields a pass grants with each paid period. */
export const PASS_SHIELDS_PER_PERIOD = 2;

/** The themed dockets a pack opens. */
export const PACKS: Record<'pack_corporate' | 'pack_cold_case' | 'pack_political', { key: string; theme: string }> = {
  pack_corporate: {
    key: 'corporate',
    theme:
      'THE BOARDROOM DOCKET: white-collar and corporate crime — fraud, insider dealing, falsified safety reports, bribery of officials, wage theft. The defendant is a professional; the evidence is paper, email and money trails; the witnesses are colleagues with their own interests.',
  },
  pack_cold_case: {
    key: 'cold_case',
    theme:
      'THE COLD CASE DOCKET: a crime from ten to thirty years ago, reopened on new evidence (a DNA re-test, a deathbed statement, a recanted alibi). Memories have faded, witnesses have changed, and the defendant has built a life since. Time is part of the evidence.',
  },
  pack_political: {
    key: 'political',
    theme:
      'THE POWER DOCKET: public office and public trust — a councillor, a procurement officer, a police chief or a campaign official accused of corruption, abuse of office or election offences. Politically charged, but the case turns on evidence, never on party. Invent no real politicians or parties.',
  },
};

export const SKUS: Sku[] = [
  // ---- The Juror Pass ----
  //
  // The whole game while it lasts: an unlimited docket, no adverts, every
  // special docket and courtroom, the gold seal, half as much Merit again for
  // service, and two streak shields a period. It still cannot buy a verdict,
  // rank or trust — the one line this store never crosses.
  {
    id: 'pass_monthly',
    title: 'Juror Pass — Monthly',
    blurb:
      'Unlimited cases, no adverts, every special docket and courtroom, the gold seal, +50% Merit and two streak shields a month.',
    priceMinor: 499,
    meritPrice: null,
    grants: ['pass'],
    kind: 'pass',
    store: 'subscription',
    period: 'month',
  },
  {
    id: 'pass_yearly',
    title: 'Juror Pass — Yearly',
    blurb: 'Everything in the monthly pass, for a year, at half the price.',
    priceMinor: 2999,
    meritPrice: null,
    grants: ['pass'],
    kind: 'pass',
    store: 'subscription',
    period: 'year',
    badge: 'Best value',
  },

  // ---- Starter bundle: once, for new jurors ----
  {
    id: 'starter_bundle',
    title: 'Founding Juror Bundle',
    blurb:
      'Unlimited docket and no adverts, for ever — plus the brass seal, 1,500 Merit and two streak shields. Offered once, in your first three days.',
    priceMinor: 499,
    meritPrice: null,
    grants: ['campaign', 'no_ads', 'seal_brass'],
    meritGranted: 1500,
    shieldsGranted: 2,
    kind: 'bundle',
    store: 'nonconsumable',
    badge: 'New jurors',
    starter: true,
  },

  // ---- Unlocks ----
  {
    id: 'campaign',
    title: 'Unlimited Docket',
    blurb:
      'No daily limit, for ever. Sit as many cases as you like, whenever you like. Earnable with Merit, too.',
    priceMinor: 499,
    // Earnable, and a real road: roughly 70 cases of service, or a few weeks
    // of daily play. A player who will not pay still gets there.
    meritPrice: 6000,
    grants: ['campaign'],
    kind: 'unlock',
    store: 'nonconsumable',
  },
  {
    id: 'no_ads',
    title: 'No Adverts. Ever.',
    blurb:
      'Removes every interstitial, permanently. Rewarded views stay available if you want them; they are never required.',
    priceMinor: 399,
    // Deliberately NOT earnable. An ad-removal you can grind for is a game
    // that makes you watch ads to stop watching ads.
    meritPrice: null,
    grants: ['no_ads'],
    kind: 'unlock',
    store: 'nonconsumable',
  },

  // ---- Special dockets ----
  //
  // Ten cases each, generated to a theme (services/caseGenerator, `special`)
  // and counted by `Case.pack`. They came off the shelf once because nothing
  // was behind them; there is now.
  {
    id: 'pack_corporate',
    title: 'The Boardroom Docket',
    blurb: 'Ten white-collar cases: fraud, bribery, falsified safety reports. The evidence is paper and the witnesses have shares.',
    priceMinor: 199,
    meritPrice: 2500,
    grants: ['pack_corporate'],
    kind: 'pack',
    store: 'nonconsumable',
  },
  {
    id: 'pack_cold_case',
    title: 'The Cold Case Docket',
    blurb: 'Ten crimes from decades ago, reopened on new evidence. Memories fade; the defendant has built a life since.',
    priceMinor: 199,
    meritPrice: 2500,
    grants: ['pack_cold_case'],
    kind: 'pack',
    store: 'nonconsumable',
  },
  {
    id: 'pack_political',
    title: 'The Power Docket',
    blurb: 'Ten cases of public office and public trust: councillors, contracts, and the people who look away.',
    priceMinor: 199,
    meritPrice: 2500,
    grants: ['pack_political'],
    kind: 'pack',
    store: 'nonconsumable',
  },

  // ---- Consumables ----
  {
    id: 'extra_docket',
    title: 'Three More Cases',
    blurb: 'Open three more cases today, past the free docket.',
    priceMinor: null,
    meritPrice: 200,
    grants: [],
    casesGranted: 3,
    kind: 'consumable',
    store: null,
  },
  {
    id: 'streak_shield',
    title: 'Streak Shield',
    blurb: 'Covers one missed day, automatically, so your streak survives it.',
    priceMinor: null,
    meritPrice: 400,
    grants: [],
    shieldsGranted: 1,
    kind: 'consumable',
    store: null,
  },
  {
    id: 'shield_pack',
    title: 'Three Streak Shields',
    blurb: 'Three missed days covered. They wait until you need them.',
    priceMinor: 99,
    meritPrice: null,
    grants: [],
    shieldsGranted: 3,
    kind: 'consumable',
    store: 'consumable',
  },

  // ---- Merit ----
  {
    id: 'merit_small',
    title: '1,200 Merit',
    blurb: 'For the impatient. Everything Merit buys can also be earned by sitting cases.',
    priceMinor: 199,
    meritPrice: null,
    grants: [],
    meritGranted: 1200,
    kind: 'currency',
    store: 'consumable',
  },
  {
    id: 'merit_medium',
    title: '3,500 Merit',
    blurb: 'A courtroom and a seal, or most of a special docket.',
    priceMinor: 499,
    meritPrice: null,
    grants: [],
    meritGranted: 3500,
    kind: 'currency',
    store: 'consumable',
    badge: 'Popular',
  },
  {
    id: 'merit_large',
    title: '8,000 Merit',
    blurb: 'The unlimited docket and change.',
    priceMinor: 999,
    meritPrice: null,
    grants: [],
    meritGranted: 8000,
    kind: 'currency',
    store: 'consumable',
    badge: 'Best value',
  },

  // ---- Cosmetics ----
  //
  // Every one of these is drawn: seals in components/Seal.tsx, courtrooms in
  // scene2d/CourtroomScene (THEMES). All earnable, and cheap in Merit — a
  // cosmetic nobody can earn is a paywall with better art.
  {
    id: 'seal_brass',
    title: 'Brass Seal',
    blurb: 'Your mark on the record and beside your name on the registry. Struck in brass.',
    priceMinor: 199,
    meritPrice: 900,
    grants: ['seal_brass'],
    kind: 'cosmetic',
    store: 'nonconsumable',
  },
  {
    id: 'seal_obsidian',
    title: 'Obsidian Seal',
    blurb: 'Black glass. Reads as a threat, which some jurors enjoy.',
    priceMinor: 199,
    meritPrice: 900,
    grants: ['seal_obsidian'],
    kind: 'cosmetic',
    store: 'nonconsumable',
  },
  {
    id: 'seal_ivory',
    title: 'Ivory Seal',
    blurb: 'Pale, old, and slightly disapproving.',
    priceMinor: 199,
    meritPrice: 900,
    grants: ['seal_ivory'],
    kind: 'cosmetic',
    store: 'nonconsumable',
  },
  {
    id: 'room_oak',
    title: 'Oak Chamber',
    blurb: 'An old courtroom in dark oak and lamplight. The one in the films.',
    priceMinor: 199,
    meritPrice: 1500,
    grants: ['room_oak'],
    kind: 'cosmetic',
    store: 'nonconsumable',
  },
  {
    id: 'room_marble',
    title: 'Marble Hall',
    blurb: 'A supreme-court hall: pale stone, high light, very little warmth.',
    priceMinor: 199,
    meritPrice: 1500,
    grants: ['room_marble'],
    kind: 'cosmetic',
    store: 'nonconsumable',
  },
  {
    id: 'room_concrete',
    title: 'Brutalist Court',
    blurb: 'Poured concrete and strip lights. Justice, municipal edition.',
    priceMinor: 199,
    meritPrice: 1500,
    grants: ['room_concrete'],
    kind: 'cosmetic',
    store: 'nonconsumable',
  },
  {
    id: 'room_night',
    title: 'Night Session',
    blurb: 'The same room after hours: blue windows, one lamp, nobody going home.',
    priceMinor: 199,
    meritPrice: 1500,
    grants: ['room_night'],
    kind: 'cosmetic',
    store: 'nonconsumable',
  },

  // ---- Support ----
  {
    id: 'patron',
    title: 'Patron of the Court',
    blurb:
      'For people who want the game to keep existing. A seal beside your name on the public registry, and nothing else — no advantage, because there is nothing here worth having an advantage in.',
    priceMinor: 1999,
    // Not earnable, and not pretending to be: this is a donation with a badge.
    meritPrice: null,
    grants: ['patron'],
    kind: 'support',
    store: 'nonconsumable',
  },
];

export const skuById = (id: string): Sku | undefined => SKUS.find((s) => s.id === id);

/**
 * Merit rates.
 *
 * Tuned so the campaign is reachable in roughly 60 cases of ordinary play —
 * long enough that $4.99 is a real convenience, short enough that "earnable"
 * is not a lie told to the app store.
 *
 * Every rate is paid for SERVICE. None of them can see whether the verdict was
 * right, which is the same firewall rank has: an economy that paid for correct
 * verdicts would be a scoreboard, and a scoreboard answers the question this
 * game exists to keep open.
 */
export const MERIT = {
  perCase: 60,
  /** Reading before deciding. Same signal XP uses; costs the player nothing. */
  deliberationBonus: 25,
  /** The clock decided, not you. */
  hungPenalty: -20,
  perDailyMissionMultiplier: 1,
  streakDay: 15,
  streakCap: 150,
  rewardedAd: 120,
  /** Rewarded views per day. A faucet needs a tap, not a hole. */
  rewardedAdsPerDay: 5,
} as const;

export function meritForVerdict(opts: {
  wasHung: boolean;
  timeRemaining: number;
  clockSeconds: number;
}): number {
  if (opts.wasHung) return Math.max(0, MERIT.perCase + MERIT.hungPenalty);
  const used = opts.clockSeconds - opts.timeRemaining;
  const deliberated = used >= opts.clockSeconds / 3 ? MERIT.deliberationBonus : 0;
  return MERIT.perCase + deliberated;
}

export function meritForStreak(streakDays: number): number {
  return Math.min(MERIT.streakCap, streakDays * MERIT.streakDay);
}
