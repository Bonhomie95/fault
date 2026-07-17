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
 * So the store sells exactly two kinds of thing:
 *   - MORE GAME    (the campaign, case packs, extra dockets)
 *   - LESS FRICTION (no ads)
 *
 * and never BETTER OUTCOMES.
 *
 * Everything with a Merit price is genuinely reachable by playing — Merit is
 * paid for service, so a player who never spends a penny still gets there.
 * Money buys the same thing sooner. That is the only difference, deliberately.
 */

export interface Sku {
  id: string;
  title: string;
  blurb: string;
  /** Minor units, USD. Null = not for sale, Merit only. */
  priceMinor: number | null;
  /** Null = not earnable, money only. */
  meritPrice: number | null;
  /** What owning it grants. Null for consumables like Merit bundles. */
  grants: Entitlement | null;
  /** Merit granted on purchase, for the bundles. */
  meritGranted?: number;
  kind: 'unlock' | 'pack' | 'currency' | 'cosmetic' | 'support';
}

export const CAMPAIGN_TRIAL_CASES = 10;

export const SKUS: Sku[] = [
  {
    id: 'campaign',
    title: 'The Full Docket',
    blurb:
      'The trial ends at ten cases. This opens the rest of the career — every chapter, every echo, every consequence.',
    priceMinor: 499,
    // Earnable, but it is a long road: roughly 60 cases of service. A player
    // who will not pay can still get there, which is the point of Merit.
    meritPrice: 6000,
    grants: 'campaign',
    kind: 'unlock',
  },
  {
    id: 'no_ads',
    title: 'No Advertising. Ever.',
    blurb:
      'Removes every interstitial, permanently. Rewarded views stay available if you want them; they are never required.',
    priceMinor: 999,
    // Deliberately NOT earnable. An ad-removal you can grind for is a game
    // that makes you watch ads to stop watching ads, which is a dark pattern
    // wearing a progression system.
    meritPrice: null,
    grants: 'no_ads',
    kind: 'unlock',
  },
  {
    id: 'pack_corporate',
    title: 'The Files: Corporate Malfeasance',
    blurb: 'Ten hand-authored cases. Boardrooms, shell companies, and the paperwork that outlives the people.',
    priceMinor: 199,
    meritPrice: 2500,
    grants: 'pack_corporate',
    kind: 'pack',
  },
  {
    id: 'pack_cold_case',
    title: 'The Files: Cold Cases',
    blurb: 'Ten hand-authored cases. Evidence that has been sitting in a box longer than some of the witnesses have been alive.',
    priceMinor: 199,
    meritPrice: 2500,
    grants: 'pack_cold_case',
    kind: 'pack',
  },
  {
    id: 'pack_political',
    title: 'The Files: Political Corruption',
    blurb: 'Ten hand-authored cases. Everyone in the room has something to lose and none of it is liberty.',
    priceMinor: 199,
    meritPrice: 2500,
    grants: 'pack_political',
    kind: 'pack',
  },
  {
    id: 'merit_small',
    title: '1,200 Merit',
    blurb: 'For the impatient. Everything Merit buys can also be earned by sitting cases.',
    priceMinor: 199,
    meritPrice: null,
    grants: null,
    meritGranted: 1200,
    kind: 'currency',
  },
  {
    id: 'merit_large',
    title: '7,000 Merit',
    blurb: 'For the very impatient.',
    priceMinor: 999,
    meritPrice: null,
    grants: null,
    meritGranted: 7000,
    kind: 'currency',
  },

  // ---- Cosmetics ----
  //
  // The honest way to widen revenue in a game about integrity: sell how the
  // room looks, never what happens in it. All of them are earnable, and priced
  // low enough in Merit that a player who never pays still collects them —
  // a cosmetic nobody can earn is just a paywall with better art.
  //
  // Only the seals are here, because only the seals are DRAWN. The courtroom
  // finishes and dossier stocks exist in the Entitlement enum and are not for
  // sale: selling a cosmetic nothing renders is taking money for a promise,
  // and the whole point of this catalogue is that it does not do that. They
  // come back the day the room can actually change.
  {
    id: 'seal_brass',
    title: 'Brass Seal',
    blurb: 'Your mark on the record and beside your name on the registry. Struck in brass.',
    priceMinor: 199,
    meritPrice: 900,
    grants: 'seal_brass',
    kind: 'cosmetic',
  },
  {
    id: 'seal_obsidian',
    title: 'Obsidian Seal',
    blurb: 'Black glass. Reads as a threat, which some jurors enjoy.',
    priceMinor: 199,
    meritPrice: 900,
    grants: 'seal_obsidian',
    kind: 'cosmetic',
  },
  {
    id: 'seal_ivory',
    title: 'Ivory Seal',
    blurb: 'Pale, old, and slightly disapproving.',
    priceMinor: 199,
    meritPrice: 900,
    grants: 'seal_ivory',
    kind: 'cosmetic',
  },

  // ---- Support ----
  {
    id: 'patron',
    title: 'Patron of the Court',
    blurb:
      'For people who want the game to keep existing. A seal, a line in the credits, and nothing else — no advantage, because there is nothing here worth having an advantage in.',
    priceMinor: 1999,
    // Not earnable, and not pretending to be: this is a donation with a badge.
    meritPrice: null,
    grants: 'patron',
    kind: 'support',
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
