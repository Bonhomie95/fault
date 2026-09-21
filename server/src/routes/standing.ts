import { Router } from 'express';
import { z } from 'zod';
import { GATES } from '../domain/progression.js';
import { ladderFor, tierLabel } from '../domain/jurisdiction.js';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';
import { invalidateCaseCache } from '../services/caseGenerator.js';
import { claimMission, MISSIONS, missionMerit, missionsFor, unclaimMission } from '../services/missions.js';
import { grantMerit } from '../services/economy.js';
import { districtLadder } from '../domain/districts.js';
import { rankFor } from '../domain/progression.js';
import { dailyFor } from '../services/progression.js';

const def = (key: string) => MISSIONS.find((m) => m.key === key);
import {
  awardXp,
  decideApplication,
  eligibleCountries,
  standingFor,
  tryPromote,
} from '../services/progression.js';

export const standingRouter = Router();

/** Rank, standing, streak, and exactly what the next rung wants. */
standingRouter.get('/', requireJuror, async (req, res) => {
  res.json(await standingFor(req.juror.user));
});

/** The ladder for wherever this juror currently sits. */
standingRouter.get('/ladder', requireJuror, async (req, res) => {
  const { user } = req.juror;
  const country = user.currentCountry ?? user.homeCountry;
  const ladder = ladderFor(country);

  res.json({
    country,
    current: user.currentTier,
    rungs: ladder.map((tier) => ({
      tier,
      label: tierLabel(tier, country),
      reached: ladder.indexOf(tier) <= ladder.indexOf(user.currentTier),
    })),
  });
});

/** Ask for the next rung. The ladder decides. */
standingRouter.post('/promote', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;
  const promoted = await tryPromote(userId);

  if (!promoted) {
    const standing = await standingFor(user);
    res.status(409).json({
      error: 'not_eligible',
      blockedBy: standing.promotion?.blockedBy ?? ['You have reached the highest bench there is.'],
    });
    return;
  }

  // The buffer holds cases written for the bench they just left.
  await invalidateCaseCache(userId);

  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  res.json({ promoted, standing: await standingFor(fresh) });
});

standingRouter.get('/missions', requireJuror, async (req, res) => {
  res.json({ missions: await missionsFor(req.juror.userId) });
});

standingRouter.post('/missions/claim', requireJuror, async (req, res) => {
  const parsed = z.object({ key: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'mission key required' });
    return;
  }

  const xp = await claimMission(req.juror.userId, parsed.data.key);
  const meritDue = xp > 0 ? missionMerit(parsed.data.key) : 0;
  if (xp === 0) {
    res.status(409).json({ error: 'nothing to claim' });
    return;
  }

  // The mission is already marked claimed at this point, so a failure here
  // loses the XP for good — the player did the work, the row says paid, and
  // nothing was paid. Put the claim back if the award cannot land, so they can
  // simply tap again.
  let rank: number;
  try {
    ({ rank } = await awardXp(req.juror.userId, xp));
  } catch (err) {
    await unclaimMission(req.juror.userId, parsed.data.key).catch(() => {});
    throw err;
  }

  // Merit rides along. A failure here is logged, not rolled back: the XP —
  // the part that moves standing — has landed, and Merit is a ledger entry
  // the player can see is missing and report.
  let merit: number | null = null;
  if (meritDue > 0) {
    merit = await grantMerit(req.juror.userId, meritDue, 'mission', parsed.data.key).catch(() => null);
  }

  res.json({ xp: def(parsed.data.key)?.xp ?? xp, merit: meritDue, meritTotal: merit, rank });
});

// ---- Applying to sit somewhere you are not from ----

standingRouter.get('/jurisdictions', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;
  const standing = await standingFor(user);

  if (!standing.unlocks.foreignApplications) {
    res.status(423).json({
      error: 'locked',
      message: `Foreign benches do not consider applications below ${GATES.foreignApplications === 4 ? 'Senior Juror' : `rank ${GATES.foreignApplications}`}.`,
      requiredRank: GATES.foreignApplications,
      rank: standing.rank,
    });
    return;
  }

  const applications = await prisma.jurisdictionApplication.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    countries: eligibleCountries(user),
    applications: applications.map((a) => ({
      id: a.id,
      country: a.country,
      tier: a.tier,
      status: a.status,
      decisionText: a.decisionText,
      decidedAt: a.decidedAt,
    })),
  });
});

const applySchema = z.object({
  country: z.string().length(2),
  tier: z.enum(['district', 'state', 'national', 'supranational', 'international', 'world']),
});

/**
 * Apply to a foreign bench. Decided immediately and on the record — the
 * player is told why, in the bench's own words, not shown a score.
 */
standingRouter.post('/jurisdictions/apply', requireJuror, async (req, res) => {
  const { userId, user } = req.juror;
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid application' });
    return;
  }

  const standing = await standingFor(user);
  if (!standing.unlocks.foreignApplications) {
    res.status(423).json({ error: 'locked', requiredRank: GATES.foreignApplications });
    return;
  }

  const country = parsed.data.country.toUpperCase();
  if (country === (user.currentCountry ?? user.homeCountry)) {
    res.status(400).json({ error: 'you already sit here' });
    return;
  }

  // One live application per country at a time.
  const open = await prisma.jurisdictionApplication.findFirst({
    where: { userId, country, status: 'pending' },
  });
  if (open) {
    res.status(409).json({ error: 'an application to this country is already before the bench' });
    return;
  }

  const decision = await decideApplication(user, country, parsed.data.tier);

  const application = await prisma.jurisdictionApplication.create({
    data: {
      userId,
      country,
      tier: parsed.data.tier,
      status: decision.accepted ? 'accepted' : 'rejected',
      decisionText: decision.text,
      trustAtDecision: decision.trust,
      rankAtDecision: decision.rank,
      decidedAt: new Date(),
    },
  });

  if (decision.accepted) {
    await prisma.user.update({
      where: { id: userId },
      // A new country is a new map: sit in its first district until more open.
      data: { currentCountry: country, currentTier: parsed.data.tier, currentDistrict: null },
    });
    // Cases queued for the old bench are meaningless now.
    await invalidateCaseCache(userId);
  }

  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  res.status(201).json({
    accepted: decision.accepted,
    decisionText: decision.text,
    applicationId: application.id,
    standing: await standingFor(fresh),
  });
});

// ---- The map: districts that open by rank ----

/** Every district in the current country, with what it takes to open it. */
standingRouter.get('/districts', requireJuror, async (req, res) => {
  const user = req.juror.user;
  res.json({ districts: districtLadder({ ...user, rank: rankFor(user.xp).level }) });
});

/** Sit in another district. Only an opened one; the cache is for the old seat. */
standingRouter.post('/districts/select', requireJuror, async (req, res) => {
  const parsed = z.object({ district: z.string().min(1).max(80) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'district required' });
    return;
  }
  const user = req.juror.user;
  const ladder = districtLadder({ ...user, rank: rankFor(user.xp).level });
  const target = ladder.find((d) => d.name === parsed.data.district);
  if (!target) {
    res.status(404).json({ error: 'no such district' });
    return;
  }
  if (!target.unlocked) {
    res.status(403).json({ error: 'locked', message: `Opens at rank ${target.unlockRank}.` });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { currentDistrict: target.home ? null : target.name },
  });
  await invalidateCaseCache(user.id);
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  res.json({
    districts: districtLadder({ ...fresh, rank: rankFor(fresh.xp).level }),
    standing: await standingFor(fresh),
  });
});

// ---- The daily summons ----

standingRouter.post('/daily', requireJuror, async (req, res) => {
  const user = req.juror.user;
  const daily = dailyFor(user);
  if (!daily.available) {
    res.status(409).json({ error: 'already_collected', message: 'Today’s summons is already answered.' });
    return;
  }
  // Conditional: two taps, one payment.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ lastRewardDay: null }, { lastRewardDay: { not: daily.day } }] },
    data: { lastRewardDay: daily.day },
  });
  if (claimed.count === 0) {
    res.status(409).json({ error: 'already_collected', message: 'Today’s summons is already answered.' });
    return;
  }
  const merit = await grantMerit(user.id, daily.merit, 'streak', `daily:${daily.day}`);
  res.json({ merit: daily.merit, meritTotal: merit, day: daily.day });
});
