import { Prisma } from '@prisma/client';
import { cityVerdict, MIN_CASES_TO_RANK, PEACE_SQL } from '../domain/peace.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

/**
 * The boards.
 *
 * Two lists off one scale (see domain/peace): the cities most at peace, and
 * the cities most lost. Ranking happens in Postgres rather than in Node —
 * pulling every city into memory to sort it works fine at ten players and
 * falls over at ten thousand, and this is the one query in the game that every
 * player hits and nobody's own data can shard.
 *
 * A juror's name is public here. That is worth being deliberate about: the
 * name is chosen by the player and the sign-in screen says it need not be
 * their own. Nothing else about them is exposed — not their country's real
 * district, not their record, not their verdicts.
 */

export type Board = 'peaceful' | 'lawless';

export interface BoardEntry {
  rank: number;
  jurorName: string;
  country: string | null;
  peaceIndex: number;
  verdict: string;
  casesHeard: number;
  /** True for the requesting player's own row. */
  you?: boolean;
}

export interface BoardView {
  board: Board;
  top: BoardEntry[];
  /**
   * The player's own standing, always — whether or not they made the top 100.
   * Null only when they have not heard enough cases to be ranked at all.
   */
  you: (BoardEntry & { inTop: boolean }) | null;
  /** How many cities qualify at all. Context for a rank of 4,812. */
  ranked: number;
  qualifyAt: number;
}

const TOP_N = 100;
const CACHE_TTL = 60; // the boards move slowly; a minute is plenty

interface Row {
  userId: string;
  jurorName: string;
  homeCountry: string | null;
  peace: number;
  totalCases: number;
  position: bigint;
}

/**
 * One ranked pass over every qualifying city.
 *
 * RANK() rather than ROW_NUMBER(): two cities on an identical index are
 * genuinely tied and should be told so, instead of being ordered by whichever
 * row Postgres happened to reach first.
 */
function rankedQuery(board: Board) {
  const direction = board === 'peaceful' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

  return Prisma.sql`
    SELECT
      u.id            AS "userId",
      u."jurorName"   AS "jurorName",
      u."homeCountry" AS "homeCountry",
      ${Prisma.raw(PEACE_SQL)} AS peace,
      jp."totalCases" AS "totalCases",
      RANK() OVER (ORDER BY ${Prisma.raw(PEACE_SQL)} ${direction}) AS position
    FROM users u
    JOIN city_state cs     ON cs."userId" = u.id
    JOIN juror_profiles jp ON jp."userId" = u.id
    WHERE jp."totalCases" >= ${MIN_CASES_TO_RANK}
  `;
}

const toEntry = (row: Row): BoardEntry => ({
  rank: Number(row.position),
  jurorName: row.jurorName,
  country: row.homeCountry,
  peaceIndex: Math.round(row.peace * 10) / 10,
  verdict: cityVerdict(row.peace),
  casesHeard: row.totalCases,
});

export async function getBoard(board: Board, userId: string): Promise<BoardView> {
  const cacheKey = `board:${board}`;
  let top: BoardEntry[] | null = null;
  let ranked = 0;

  // The top 100 is identical for everyone, so it caches. The player's own row
  // never does — it is one cheap indexed lookup and it must be current.
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { top: BoardEntry[]; ranked: number };
      top = parsed.top;
      ranked = parsed.ranked;
    }
  } catch {
    /* cache is an optimisation, never a dependency */
  }

  if (!top) {
    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH board AS (${rankedQuery(board)})
      SELECT * FROM board ORDER BY position ASC LIMIT ${TOP_N}
    `);
    const [{ count }] = await prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
      SELECT count(*) AS count
      FROM users u
      JOIN city_state cs     ON cs."userId" = u.id
      JOIN juror_profiles jp ON jp."userId" = u.id
      WHERE jp."totalCases" >= ${MIN_CASES_TO_RANK}
    `);

    top = rows.map(toEntry);
    ranked = Number(count);
    await redis.set(cacheKey, JSON.stringify({ top, ranked }), 'EX', CACHE_TTL).catch(() => {});
  }

  // Where the player actually stands. Fetched even when they are in the top
  // 100 — the client should not have to work out whether to ask.
  const mine = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH board AS (${rankedQuery(board)})
    SELECT * FROM board WHERE "userId" = ${userId}
  `);

  const me = mine[0];
  const you = me
    ? { ...toEntry(me), you: true, inTop: Number(me.position) <= TOP_N }
    : null;

  return {
    board,
    top: top.map((e) => (me && e.rank === Number(me.position) && e.jurorName === me.jurorName ? { ...e, you: true } : e)),
    you,
    ranked,
    qualifyAt: MIN_CASES_TO_RANK,
  };
}
