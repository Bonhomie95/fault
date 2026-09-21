import type { Case, NewsItem, User } from '@prisma/client';
import { CITY_METRIC_KEYS, type CityMetrics } from '../domain/city.js';
import { courtroomLineSchema, type Witness } from '../domain/case.js';
import { currentDistrictFor } from '../domain/districts.js';
import { profileFor } from '../domain/jurisdiction.js';
import {
  cityEvent,
  courtReport,
  echoStory,
  falloutFor,
  type NewsContext,
  type Roll,
  type Story,
} from '../domain/news.js';
import { rankFor } from '../domain/progression.js';
import { log } from '../lib/log.js';
import { prisma } from '../lib/prisma.js';
import { deriveFactions } from './cityEffects.js';
import { getCityState, updateCityState } from './cityState.js';

/**
 * Printing the papers, and letting the city move while nobody is looking.
 *
 * Two entry points:
 *
 *   printVerdict    after a verdict — the court report and the fallout
 *   runCityClock    whenever the player comes back — what happened while
 *                   they were away, and the dials moving with it
 *
 * The clock is the come-back loop. A city left alone does not freeze: crime
 * with nobody sitting drifts up, a syndicate with a light docket grows bolder,
 * trust drifts toward indifference. The papers report it, dated when it
 * happened, and the player returns to a front page that is about them.
 */

/** One city-clock tick per this many hours away. */
export const TICK_HOURS = 6;
/** Most ticks applied at once. A month away is not thirty disasters. */
export const MAX_TICKS = 4;
/** How much older than this the feed does not keep. */
const KEEP_DAYS = 45;

function contextFor(user: Pick<User, 'rank' | 'homeCountry' | 'currentCountry' | 'homeDistrict' | 'currentDistrict' | 'currentTier'>, city: CityMetrics): NewsContext {
  const country = user.currentCountry ?? user.homeCountry;
  const profile = profileFor(country);
  const district = currentDistrictFor(user);
  return {
    district,
    court: profile.courtName(user.currentTier, district),
    police: profile.policeService(district),
    neighbourhoods: profile.texture.neighbourhoods,
    market: profile.texture.market,
    transportJob: profile.texture.transportJob,
    money: profile.texture.money,
    factions: deriveFactions(city).filter((f) => /syndicate/i.test(f)).length
      ? deriveFactions(city).filter((f) => /syndicate/i.test(f))
      : ['the Syndicate'],
  };
}

/** A line worth quoting from the courtroom, verdict-blind by construction. */
function quoteFrom(c: Pick<Case, 'lines' | 'defendantName' | 'witnesses'>, roll: Roll) {
  const lines = (Array.isArray(c.lines) ? c.lines : []).flatMap((l) => {
    const parsed = courtroomLineSchema.safeParse(l);
    return parsed.success ? [parsed.data] : [];
  });
  if (!lines.length) return null;
  const line = lines[Math.floor(roll() * lines.length) % lines.length]!;
  const witnesses = (c.witnesses as Witness[]) ?? [];
  const speaker =
    line.speaker === 'defendant'
      ? c.defendantName
      : line.speaker === 'witness1'
        ? (witnesses[0]?.name ?? 'a witness')
        : line.speaker === 'witness2'
          ? (witnesses[1]?.name ?? 'a witness')
          : line.speaker === 'prosecution'
            ? 'the prosecution'
            : 'the defence';
  return { speaker, text: line.text };
}

async function store(userId: string, stories: Story[], extra: { district: string; caseId?: string; at?: Date }) {
  if (!stories.length) return [];
  const created = await prisma.$transaction(
    stories.map((s, i) =>
      prisma.newsItem.create({
        data: {
          userId,
          kind: s.kind,
          outlet: s.outlet,
          headline: s.headline.slice(0, 200),
          body: s.body.slice(0, 1200),
          severity: s.severity,
          district: extra.district,
          caseId: extra.caseId ?? null,
          // Stories printed together still read in order: a millisecond apart.
          createdAt: extra.at ? new Date(extra.at.getTime() + i) : new Date(Date.now() + i),
        },
      }),
    ),
  );
  return created;
}

/**
 * The papers the morning after a verdict: the court report, and — most of the
 * time — one piece of fallout. Never throws: news is colour, and a verdict
 * must not fail because a headline could not be printed.
 */
export async function printVerdict(
  user: User,
  c: Case,
  verdict: 'guilty' | 'not_guilty',
  wasHung: boolean,
  effectKey: string,
  cityAfter: CityMetrics,
  roll: Roll = Math.random,
): Promise<NewsItem[]> {
  try {
    const ctx = contextFor(user, cityAfter);
    const facts = {
      defendant: c.defendantName,
      charge: c.charge,
      occupation: c.defendantOccupation,
      verdict,
      wasHung,
      quote: quoteFrom(c, roll),
    };
    const stories: Story[] = [courtReport(ctx, facts, roll)];
    // Not every verdict makes a second story. Two thirds do.
    if (roll() < 0.67) {
      const fallout = falloutFor(ctx, effectKey, facts, roll);
      if (fallout) stories.push(fallout);
    }
    return await store(user.id, stories, { district: ctx.district, caseId: c.id });
  } catch (err) {
    log.warn('news: could not print verdict', { error: (err as Error).message });
    return [];
  }
}

function drift(city: CityMetrics, roll: Roll): CityMetrics {
  // A city with nobody on the bench: crime creeps with the syndicate and
  // against trust; trust relaxes toward the middle; the press cools.
  const next = { ...city };
  next.crimeRate += (city.organizedCrimePower - 50) / 25 + (50 - city.judicialTrust) / 40 + (roll() - 0.4);
  next.judicialTrust += (50 - city.judicialTrust) / 20;
  next.mediaPressure += (40 - city.mediaPressure) / 12;
  next.organizedCrimePower += (city.crimeRate - 55) / 40 + (roll() - 0.5) * 0.6;
  for (const k of CITY_METRIC_KEYS) next[k] = Math.max(0, Math.min(100, Math.round(next[k] * 10) / 10));
  return next;
}

/**
 * Catch the city up to now. Returns the stories printed while the player was
 * away, oldest first, so the client can show "while you were away".
 */
export async function runCityClock(user: User, roll: Roll = Math.random, now = new Date()): Promise<NewsItem[]> {
  const elapsedH = (now.getTime() - user.lastCityTickAt.getTime()) / 3_600_000;
  const ticks = Math.min(MAX_TICKS, Math.floor(elapsedH / TICK_HOURS));
  if (ticks <= 0) return [];

  // Claim the ticks FIRST, conditionally, so two requests arriving together
  // (lobby and news at once, say) cannot both run the clock.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, lastCityTickAt: user.lastCityTickAt },
    data: { lastCityTickAt: now },
  });
  if (claimed.count === 0) return [];

  // A brand-new juror has no city to come back to yet.
  const heard = await prisma.verdictRecord.count({ where: { userId: user.id } });
  if (heard === 0) return [];

  try {
    let city: CityMetrics = await getCityState(user.id);
    const printed: NewsItem[] = [];
    const ctxUser = { ...user, rank: rankFor(user.xp).level };
    for (let t = ticks; t >= 1; t--) {
      const at = new Date(now.getTime() - t * TICK_HOURS * 3_600_000 + roll() * 3_600_000);
      city = drift(city, roll);
      const ctx = contextFor(ctxUser, city);
      const event = cityEvent(ctx, city, roll);
      for (const [k, v] of Object.entries(event.deltas)) {
        const key = k as keyof CityMetrics;
        city[key] = Math.max(0, Math.min(100, city[key] + (v as number)));
      }
      const stories: Story[] = [event.story];

      // Now and then a face from the docket turns up in the papers.
      if (roll() < 0.18) {
        const echo = await prisma.character.findFirst({
          where: { userId: user.id, fate: 'acquitted' },
          orderBy: { createdAt: 'desc' },
          skip: Math.floor(roll() * 5),
        });
        if (echo) stories.push(echoStory(ctx, echo.name, roll));
      }
      printed.push(...(await store(user.id, stories, { district: ctx.district, at })));
    }
    await updateCityState(user.id, city);
    await prisma.newsItem.deleteMany({
      where: { userId: user.id, createdAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86_400_000) } },
    });
    return printed;
  } catch (err) {
    log.warn('news: city clock failed', { error: (err as Error).message });
    return [];
  }
}

/** Print one-off stories — a district opening, say. */
export async function printStories(userId: string, district: string, stories: Story[]) {
  try {
    return await store(userId, stories, { district });
  } catch {
    return [];
  }
}

export interface NewsView {
  id: string;
  outlet: string;
  kind: string;
  headline: string;
  body: string;
  severity: number;
  district: string | null;
  read: boolean;
  at: string;
}

export function viewOf(n: NewsItem): NewsView {
  return {
    id: n.id,
    outlet: n.outlet,
    kind: n.kind,
    headline: n.headline,
    body: n.body,
    severity: n.severity,
    district: n.district,
    read: n.read,
    at: n.createdAt.toISOString(),
  };
}

export async function feedFor(userId: string, opts: { before?: Date; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(50, opts.limit ?? 30));
  const [items, unread] = await Promise.all([
    prisma.newsItem.findMany({
      where: { userId, ...(opts.before ? { createdAt: { lt: opts.before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.newsItem.count({ where: { userId, read: false } }),
  ]);
  return { items: items.map(viewOf), unread };
}

export async function markRead(userId: string, ids?: string[]) {
  await prisma.newsItem.updateMany({
    where: { userId, read: false, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { read: true },
  });
}
