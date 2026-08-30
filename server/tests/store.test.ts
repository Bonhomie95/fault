import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CAMPAIGN_TRIAL_CASES,
  MERIT,
  meritForStreak,
  meritForVerdict,
  SKUS,
  skuById,
} from '../src/domain/store.js';

describe('the store cannot sell an advantage', () => {
  it('grants only content, convenience, cosmetics or a badge', () => {
    // The design rule, asserted. If a sku ever grants standing, a verdict, or
    // time on the clock, FAULT stops being a game about judgement and becomes
    // a game about spending.
    //
    // This list is deliberately explicit rather than derived: adding an
    // entitlement should force whoever adds it to come here, read this, and
    // decide on purpose which column it belongs in. A test that computed the
    // answer would let a `skip_timer` through on the day someone was in a
    // hurry.
    const allowed = [
      // more game
      'campaign',
      'pack_corporate',
      'pack_cold_case',
      'pack_political',
      // less friction
      'no_ads',
      // how the room looks, and nothing else
      'seal_brass',
      'seal_obsidian',
      'seal_ivory',
      'room_oak',
      'room_concrete',
      'stock_onionskin',
      'stock_vellum',
      // a thank-you
      'patron',
    ];

    for (const sku of SKUS) {
      if (sku.grants === null) continue;
      assert.ok(
        allowed.includes(sku.grants),
        `${sku.id} grants "${sku.grants}" — if that is an advantage, it does not belong in the store; if it is not, add it to this list on purpose.`,
      );
    }
  });

  it('keeps every cosmetic earnable', () => {
    // A cosmetic nobody can earn is a paywall with better art. The player who
    // never pays should still end up with a shelf of seals.
    for (const sku of SKUS.filter((s) => s.kind === 'cosmetic')) {
      assert.ok(sku.meritPrice !== null, `${sku.id} is money-only`);
      assert.ok(sku.meritPrice! <= 2000, `${sku.id} costs ${sku.meritPrice} — that is not earnable, it is a wall`);
    }
  });

  it('sells nothing that touches rank, trust, the clock or a verdict', () => {
    const forbidden = /rank|trust|standing|verdict|clock|time|xp|promotion|skip/i;
    for (const sku of SKUS) {
      assert.equal(forbidden.test(sku.id), false, `${sku.id} sounds like an advantage`);
      assert.equal(
        forbidden.test(String(sku.grants)),
        false,
        `${sku.id} grants something that sounds like an advantage`,
      );
    }
  });
});

describe('the store cannot sell a promise', () => {
  /**
   * The rule the audit found broken.
   *
   * Three case packs sat in this catalogue at $1.99 / 2,500 Merit each,
   * advertised as "Ten hand-authored cases". Their entitlement values appeared
   * in exactly three places in the repository — this catalogue, the Prisma
   * enum, and the mobile type union — and nothing read them. A player could
   * buy one and receive a database row.
   *
   * The catalogue's own comments forbid exactly this, for cosmetics: "selling
   * a cosmetic nothing renders is taking money for a promise". The seals were
   * held to the rule and the packs were not, because the rule lived in a
   * comment and comments do not run.
   *
   * This runs.
   */
  /**
   * Both halves of the repository, because "is this thing real" is a question
   * only the client can answer for a cosmetic. The seals, for instance, exist
   * entirely in mobile/components/Seal.tsx — a server-only search would call
   * them unbuilt and be wrong.
   *
   * Directories that may not exist (a server-only checkout, CI before the
   * mobile install) are skipped rather than failing the suite: this test is
   * about what IS referenced, and a missing tree cannot prove a negative. The
   * companion test below is the one that holds the line unconditionally.
   */
  const ROOTS = [
    fileURLToPath(new URL('../src', import.meta.url)),
    fileURLToPath(new URL('../../mobile/app', import.meta.url)),
    fileURLToPath(new URL('../../mobile/components', import.meta.url)),
    fileURLToPath(new URL('../../mobile/lib', import.meta.url)),
    fileURLToPath(new URL('../../mobile/store', import.meta.url)),
  ];

  /** Every source file under a root, minus the places that merely DECLARE. */
  function sourceFiles(dir: string): string[] {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return []; // tree not present in this checkout
    }

    return entries.flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      if (!/\.tsx?$/.test(entry.name)) return [];
      // Declaration sites do not count as uses of themselves: the catalogue
      // that defines the SKU, and the client type union that mirrors the enum.
      if (full.endsWith(join('domain', 'store.ts'))) return [];
      if (full.endsWith(join('lib', 'api.ts'))) return [];
      return [full];
    });
  }

  it('grants nothing that no code anywhere reads', () => {
    const corpus = ROOTS.flatMap(sourceFiles)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    for (const sku of SKUS) {
      if (!sku.grants) continue; // Merit bundles grant a balance, not a thing
      assert.ok(
        corpus.includes(sku.grants),
        `${sku.id} is for sale and grants "${sku.grants}", which nothing outside the ` +
          `catalogue ever reads. Either build the thing or take it off the shelf.`,
      );
    }
  });

  it('keeps unbuilt entitlements out of the catalogue entirely', () => {
    // The correct handling, already applied to the room finishes and dossier
    // stocks: they exist in the schema and are deliberately absent from SKUS.
    // A schema entry is a plan; a SKU is a promise.
    const forSale = new Set(SKUS.map((s) => s.grants));
    for (const unbuilt of ['pack_corporate', 'pack_cold_case', 'pack_political', 'room_oak', 'room_concrete', 'stock_onionskin', 'stock_vellum']) {
      assert.ok(!forSale.has(unbuilt as never), `${unbuilt} is on sale with nothing behind it`);
    }
  });
});

describe('everything meaningful is earnable', () => {
  it('lets a player reach the campaign without paying', () => {
    const campaign = skuById('campaign');
    assert.ok(campaign);
    assert.ok(campaign.meritPrice !== null, 'the campaign must be earnable, or "earnable" is a lie');
  });

  it('lets a player earn every case pack', () => {
    for (const pack of SKUS.filter((s) => s.kind === 'pack')) {
      assert.ok(pack.meritPrice !== null, `${pack.id} is money-only`);
    }
  });

  it('does NOT let ad-removal be ground for', () => {
    // Watching ads to earn the removal of ads is a dark pattern wearing a
    // progression system.
    assert.equal(skuById('no_ads')?.meritPrice, null);
  });

  it('keeps the campaign a real but long road', () => {
    const campaign = skuById('campaign')!;
    const perCase = MERIT.perCase + MERIT.deliberationBonus;
    const cases = Math.ceil(campaign.meritPrice! / perCase);
    // Long enough that $4.99 is genuine convenience; short enough that the
    // free path is not a fiction told to the app store.
    assert.ok(cases > 30, `only ${cases} cases to earn the campaign — too cheap`);
    assert.ok(cases < 120, `${cases} cases to earn the campaign — that is not a path, it is a wall`);
  });
});

describe('merit is paid for service, never for being right', () => {
  it('cannot see the verdict at all', () => {
    // meritForVerdict takes no `correct` and no `verdict` — it structurally
    // cannot reward prejudging, which is what makes it safe to reward.
    const a = meritForVerdict({ wasHung: false, timeRemaining: 30, clockSeconds: 120 });
    const b = meritForVerdict({ wasHung: false, timeRemaining: 30, clockSeconds: 120 });
    assert.equal(a, b);
  });

  it('pays more for reading than for snapping', () => {
    const read = meritForVerdict({ wasHung: false, timeRemaining: 20, clockSeconds: 120 });
    const snap = meritForVerdict({ wasHung: false, timeRemaining: 118, clockSeconds: 120 });
    assert.ok(read > snap);
  });

  it('pays less when the clock decided', () => {
    const hung = meritForVerdict({ wasHung: true, timeRemaining: 0, clockSeconds: 120 });
    const decided = meritForVerdict({ wasHung: false, timeRemaining: 118, clockSeconds: 120 });
    assert.ok(hung < decided);
    assert.ok(hung >= 0, 'a bad day must never cost merit outright');
  });

  it('caps the streak so it cannot run away', () => {
    assert.equal(meritForStreak(1000), MERIT.streakCap);
    assert.ok(meritForStreak(3) < meritForStreak(6));
  });

  it('caps rewarded ads per day', () => {
    // A rewarded ad is a merit faucet. A faucet needs a tap.
    assert.ok(MERIT.rewardedAdsPerDay > 0 && MERIT.rewardedAdsPerDay <= 10);
  });
});

describe('the trial', () => {
  it('is ten cases, as the GDD says', () => {
    assert.equal(CAMPAIGN_TRIAL_CASES, 10);
  });
});
