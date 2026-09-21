import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { districtLadder, currentDistrictFor, newlyUnlocked, rewardFor } from '../src/domain/districts.js';
import { cityEvent, courtReport, falloutFor, newsShapeFor, outletsFor, type NewsContext } from '../src/domain/news.js';
import { activeMissions, CAREER, DAILY, MISSIONS, WEEKLY } from '../src/services/missions.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';

/**
 * The world around the courtroom: districts that open by rank, the papers,
 * rotating missions, and the city clock.
 */

const ctx: NewsContext = {
  district: 'Kano',
  court: 'Kano Magistrate Court',
  police: 'Kano State Police Command',
  neighbourhoods: ['Sabon Gari', 'Fagge'],
  market: 'Kurmi Market',
  transportJob: 'keke driver',
  money: { small: '₦40,000', mid: '₦2m', large: '₦18m', huge: '₦180m' },
  factions: ['The Syndicate'],
};

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('districts', () => {
  const base = { homeCountry: 'NG', currentCountry: null, homeDistrict: 'Kano', currentDistrict: null };

  it('home is always open and first', () => {
    const ladder = districtLadder({ ...base, rank: 1 });
    assert.equal(ladder[0]!.name, 'Kano');
    assert.equal(ladder[0]!.unlocked, true);
    assert.ok(ladder.slice(1).every((d) => !d.unlocked), 'nothing else opens at rank 1');
  });

  it('opens by rank, and pays more further out', () => {
    const ladder = districtLadder({ ...base, rank: 6 });
    assert.ok(ladder.filter((d) => d.unlocked).length >= 3);
    assert.ok(ladder[2]!.reward > ladder[0]!.reward);
    assert.equal(rewardFor(1), 1);
  });

  it('a locked district cannot be sat in, whatever the row says', () => {
    const other = districtLadder({ ...base, rank: 12 })[3]!.name;
    assert.equal(currentDistrictFor({ ...base, currentDistrict: other, rank: 1 }), 'Kano');
    assert.equal(currentDistrictFor({ ...base, currentDistrict: other, rank: 12 }), other);
  });

  it('reports exactly the districts a promotion opened', () => {
    const ladder = districtLadder({ ...base, rank: 4 });
    const opened = newlyUnlocked(ladder, 2, 4).map((d) => d.unlockRank);
    assert.deepEqual(opened, [3, 4]);
  });
});

describe('the papers', () => {
  const facts = {
    defendant: 'Ngozi Chukwu',
    charge: 'Embezzlement of community funds',
    occupation: 'Market vendor',
    verdict: 'guilty' as const,
    wasHung: false,
    quote: { speaker: 'Ngozi Chukwu', text: 'I built schools for this community.' },
  };

  it('print a court report that names the defendant', () => {
    const s = courtReport(ctx, facts, seeded(3));
    assert.equal(s.kind, 'verdict');
    assert.match(s.headline + s.body, /Ngozi Chukwu|Market vendor/);
    assert.equal(s.outlet, outletsFor('Kano').herald);
  });

  it('never print anything derived from the hidden evidence strength', () => {
    // The two effect keys that come from evidence strength are read as a
    // plain conviction or acquittal — a headline must not tell the player
    // they got it wrong. That is the review's job, later.
    assert.equal(newsShapeFor('convict_weak_evidence'), 'standard_convict');
    assert.equal(newsShapeFor('acquit_strong_evidence'), 'standard_acquit');
    for (let i = 1; i < 60; i++) {
      const s = falloutFor(ctx, 'convict_weak_evidence', facts, seeded(i));
      assert.ok(s);
      assert.doesNotMatch(s.headline + s.body, /evidence|proof/i, s.headline);
    }
  });

  it('fill every slot', () => {
    for (let i = 1; i < 200; i++) {
      const e = cityEvent(ctx, { crimeRate: (i * 7) % 100, judicialTrust: (i * 13) % 100, wealthDisparity: (i * 3) % 100, organizedCrimePower: (i * 11) % 100, policeIntegrity: (i * 17) % 100, mediaPressure: (i * 19) % 100 }, seeded(i));
      assert.doesNotMatch(e.story.headline + e.story.body, /\{\w+\}/, e.story.headline);
    }
  });

  it('let a lawless city make lawless news', () => {
    const lawless = { crimeRate: 92, judicialTrust: 50, wealthDisparity: 50, organizedCrimePower: 40, policeIntegrity: 50, mediaPressure: 40 };
    const kinds = Array.from({ length: 80 }, (_, i) => cityEvent(ctx, lawless, seeded(i + 1)).story.kind);
    assert.ok(kinds.filter((k) => k === 'crime').length > 30, `crime stories: ${kinds.join(',')}`);
  });

  it('use invented mastheads only', () => {
    const o = Object.values(outletsFor('London')).join(' ');
    assert.doesNotMatch(o, /Mirror|Guardian|Times|Sun\b|Telegraph|FM\b/);
  });
});

describe('missions', () => {
  it('have unique, stable keys', () => {
    const keys = MISSIONS.map((m) => m.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(DAILY.length >= 15 && WEEKLY.length >= 8 && CAREER.length >= 15);
  });

  it('always offer the day’s docket, and rotate the rest per player', () => {
    const a = activeMissions('user-a', 5, '2026-09-21', '2026-W39').filter((m) => m.kind === 'daily');
    const b = activeMissions('user-b', 5, '2026-09-21', '2026-W39').filter((m) => m.kind === 'daily');
    const aTomorrow = activeMissions('user-a', 5, '2026-09-22', '2026-W39').filter((m) => m.kind === 'daily');
    assert.equal(a[0]!.key, 'daily_hear_three');
    assert.equal(a.length, 3);
    assert.ok(
      a.map((m) => m.key).join() !== b.map((m) => m.key).join() ||
        a.map((m) => m.key).join() !== aTomorrow.map((m) => m.key).join(),
      'rotation never rotates',
    );
  });

  it('never offer a mission above the player’s rank', () => {
    const offered = activeMissions('user-c', 1, '2026-09-21', '2026-W39');
    assert.ok(offered.every((m) => (m.minRank ?? 1) <= 1));
  });

  it('never read whether a verdict was right', () => {
    // The signal has no field for it; this pins that no mission counts
    // differently for guilty and not guilty.
    const s = { wasHung: false, timeRemaining: 40, clockSeconds: 120, examined: 3, witnesses: 2, arguments: true, mood: 'violent', difficulty: 4, echo: true, rank: 8, streak: 9, districtsOpen: 4, city: { crimeRate: 30, judicialTrust: 70, organizedCrimePower: 30, policeIntegrity: 70 } };
    for (const m of MISSIONS) {
      assert.equal(
        m.count({ ...s, verdict: 'guilty' } as never),
        m.count({ ...s, verdict: 'not_guilty' } as never),
        m.key,
      );
    }
  });
});

describe('the city clock', () => {
  const made: string[] = [];
  after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: made } } });
    await prisma.$disconnect();
    redis.disconnect();
  });

  it('prints what happened while the player was away, once', async () => {
    const { runCityClock } = await import('../src/services/news.js');
    const user = await prisma.user.create({
      data: {
        jurorName: 'Clock Test',
        homeCountry: 'NG',
        homeDistrict: 'Kano',
        lastCityTickAt: new Date(Date.now() - 30 * 3_600_000),
        cityState: { create: {} },
      },
    });
    made.push(user.id);
    // A juror who has never sat a case has no city to come back to.
    assert.equal((await runCityClock(user)).length, 0);

    const again = await prisma.user.update({
      where: { id: user.id },
      data: { lastCityTickAt: new Date(Date.now() - 30 * 3_600_000) },
    });
    const c = await prisma.case.create({
      data: {
        userId: user.id, caseNumber: 1, title: 't', charge: 'c', accent: '#C23B22', mood: 'm',
        defendantName: 'Musa Obi', defendantAge: 30, defendantOccupation: 'o', defendantBackground: 'b',
        evidence: [], witnesses: [], prosecutionArgument: 'p', defenceArgument: 'd', correctVerdict: 'guilty',
      },
    });
    await prisma.verdictRecord.create({
      data: { userId: user.id, caseId: c.id, verdict: 'guilty', timeRemaining: 10, wasHung: false },
    });

    const [first, second] = await Promise.all([runCityClock(again), runCityClock(again)]);
    const printed = first.length + second.length;
    assert.ok(printed >= 4 && printed <= 8, `expected one run of 4 ticks, printed ${printed}`);
    assert.ok(first.length === 0 || second.length === 0, 'the clock ran twice');
  });
});
