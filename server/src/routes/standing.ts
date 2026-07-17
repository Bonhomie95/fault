import { Router } from 'express';
import { z } from 'zod';
import { GATES } from '../domain/progression.js';
import { ladderFor, tierLabel } from '../domain/jurisdiction.js';
import { prisma } from '../lib/prisma.js';
import { requireJuror } from '../middleware/requireJuror.js';
import { invalidateCaseCache } from '../services/caseGenerator.js';
import { claimMission, missionsFor } from '../services/missions.js';
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
  if (xp === 0) {
    res.status(409).json({ error: 'nothing to claim' });
    return;
  }

  const { rank } = await awardXp(req.juror.userId, xp);
  res.json({ xp, rank });
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
      data: { currentCountry: country, currentTier: parsed.data.tier },
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
