import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getCityState } from '../services/cityState.js';

export const sessionRouter = Router();

const createSchema = z.object({
  jurorName: z.string().trim().min(1).max(40),
});

/**
 * Swearing in. The device holds this id in SecureStore; there is no password,
 * because there is no account — there is only a juror and their city.
 */
sessionRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'jurorName required (1-40 characters)' });
    return;
  }

  const user = await prisma.user.create({
    data: {
      jurorName: parsed.data.jurorName,
      cityState: { create: {} },
      jurorProfile: { create: {} },
    },
  });

  await getCityState(user.id);

  res.status(201).json({
    userId: user.id,
    jurorName: user.jurorName,
    clockSeconds: user.clockSeconds,
    trialUnlocked: user.trialUnlocked,
  });
});

/** Re-attach an existing juror on app launch. */
sessionRouter.get('/me', async (req, res) => {
  const userId = req.header('x-juror-id');
  if (!userId) {
    res.status(401).json({ error: 'x-juror-id header required' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { _count: { select: { verdicts: true } } },
  });

  if (!user) {
    res.status(404).json({ error: 'no such juror' });
    return;
  }

  res.json({
    userId: user.id,
    jurorName: user.jurorName,
    clockSeconds: user.clockSeconds,
    trialUnlocked: user.trialUnlocked,
    casesHeard: user._count.verdicts,
  });
});

const settingsSchema = z.object({
  // GDD 8: 120 is the default clock; the extended tiers are accessibility,
  // carry no penalty, and change no badge.
  clockSeconds: z.union([z.literal(120), z.literal(180), z.literal(240)]).optional(),
  trialUnlocked: z.boolean().optional(),
});

sessionRouter.patch('/me', async (req, res) => {
  const userId = req.header('x-juror-id');
  if (!userId) {
    res.status(401).json({ error: 'x-juror-id header required' });
    return;
  }

  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid settings' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: parsed.data,
  });

  res.json({ clockSeconds: user.clockSeconds, trialUnlocked: user.trialUnlocked });
});
