import type { CityMetrics, CityStateView } from '../domain/city.js';
import { peaceIndex } from '../domain/peace.js';
import { prisma } from '../lib/prisma.js';
import { cityKey, redis } from '../lib/redis.js';
import { deriveFactions } from './cityEffects.js';

const CACHE_TTL_SECONDS = 60 * 60;

const toView = (row: {
  crimeRate: number;
  judicialTrust: number;
  wealthDisparity: number;
  organizedCrimePower: number;
  policeIntegrity: number;
  mediaPressure: number;
  activeFactions: string[];
}): CityStateView => ({
  crimeRate: row.crimeRate,
  judicialTrust: row.judicialTrust,
  wealthDisparity: row.wealthDisparity,
  organizedCrimePower: row.organizedCrimePower,
  policeIntegrity: row.policeIntegrity,
  mediaPressure: row.mediaPressure,
  activeFactions: row.activeFactions,
});

/** Read-through: Redis first, Postgres as truth. */
export async function getCityState(userId: string): Promise<CityStateView> {
  try {
    const cached = await redis.get(cityKey(userId));
    if (cached) return JSON.parse(cached) as CityStateView;
  } catch {
    // Cache miss by outage — fall through to Postgres.
  }

  const row = await prisma.cityState.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  const view = toView(row);
  await redis.set(cityKey(userId), JSON.stringify(view), 'EX', CACHE_TTL_SECONDS).catch(() => {});
  return view;
}

/** Write-through: Postgres is authoritative, Redis is refreshed to match. */
export async function updateCityState(userId: string, metrics: CityMetrics): Promise<CityStateView> {
  const activeFactions = deriveFactions(metrics);

  const row = await prisma.cityState.update({
    where: { userId },
    // peaceIndex is denormalised so the boards can rank with an index range
    // count instead of sorting every city in the world per request. This is
    // the ONLY place it is written, which is what keeps it honest — it is
    // recomputed from the same metrics in the same statement that stores them,
    // so the two cannot drift apart.
    data: { ...metrics, activeFactions, peaceIndex: peaceIndex(metrics) },
  });

  const view = toView(row);
  await redis.set(cityKey(userId), JSON.stringify(view), 'EX', CACHE_TTL_SECONDS).catch(() => {});
  return view;
}
