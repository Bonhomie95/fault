import { Prisma } from '@prisma/client';
import { cityVerdict, MIN_CASES_TO_RANK } from '../domain/peace.js';
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
 * The top of a board.
 *
 * Sorts on the stored, indexed `peaceIndex` rather than recomputing the
 * weighted expression per row, so this is an index scan with a LIMIT rather
 * than a sort of every city in the world.
 *
 * RANK() rather than ROW_NUMBER(): two cities on an identical index are
 * genuinely tied and should be told so, instead of being ordered by whichever
 * row Postgres happened to reach first. Note the window here ranks only the
 * rows fetched, which is correct because they are already the highest N —
 * `myRank` below is what gives an arbitrary player their true position.
 */
function topQuery(board: Board) {
  const direction = board === 'peaceful' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

  return Prisma.sql`
    SELECT
      u.id            AS "userId",
      u."jurorName"   AS "jurorName",
      u."homeCountry" AS "homeCountry",
      cs."peaceIndex" AS peace,
      jp."totalCases" AS "totalCases",
      RANK() OVER (ORDER BY cs."peaceIndex" ${direction}) AS position
    FROM users u
    JOIN city_state cs     ON cs."userId" = u.id
    JOIN juror_profiles jp ON jp."userId" = u.id
    WHERE jp."totalCases" >= ${MIN_CASES_TO_RANK}
    ORDER BY cs."peaceIndex" ${direction}
    LIMIT ${TOP_N}
  `;
}

/**
 * One player's rank, without ranking anybody else.
 *
 * This is the fix for the query that mattered. The old version wrapped the
 * full RANK() window in a CTE and filtered it to one row — so serving one
 * player's position meant a sequential scan of city_state, a hash join, a full
 * sort and a window aggregate over every qualifying city, of which 999,999
 * rows were then thrown away. Its own comment called it "one cheap indexed
 * lookup". I read the plan; it was a Seq Scan and a Sort.
 *
 * A rank is just "how many are ahead of me, plus one", and with peaceIndex
 * stored and indexed that is a range count Postgres answers from the index
 * without visiting the rows. Ties share a rank, which is exactly RANK()'s
 * semantics — two cities on the same index are genuinely level.
 */
async function myRank(board: Board, userId: string): Promise<Row | null> {
  const ahead =
    board === 'peaceful'
      ? Prisma.sql`cs."peaceIndex" > me.peace`
      : Prisma.sql`cs."peaceIndex" < me.peace`;

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH me AS (
      SELECT u.id, u."jurorName", u."homeCountry",
             cs."peaceIndex" AS peace, jp."totalCases"
      FROM users u
      JOIN city_state cs     ON cs."userId" = u.id
      JOIN juror_profiles jp ON jp."userId" = u.id
      WHERE u.id = ${userId} AND jp."totalCases" >= ${MIN_CASES_TO_RANK}
    )
    SELECT
      me.id          AS "userId",
      me."jurorName" AS "jurorName",
      me."homeCountry" AS "homeCountry",
      me.peace       AS peace,
      me."totalCases" AS "totalCases",
      (SELECT count(*) + 1
         FROM city_state cs
         JOIN juror_profiles jp ON jp."userId" = cs."userId"
        WHERE jp."totalCases" >= ${MIN_CASES_TO_RANK}
          AND ${ahead}) AS position
    FROM me
  `);

  return rows[0] ?? null;
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
    const rows = await prisma.$queryRaw<Row[]>(topQuery(board));
    const [{ count }] = await prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
      SELECT count(*) AS count
      FROM juror_profiles jp
      JOIN city_state cs ON cs."userId" = jp."userId"
      WHERE jp."totalCases" >= ${MIN_CASES_TO_RANK}
    `);

    top = rows.map(toEntry);
    ranked = Number(count);
    await redis.set(cacheKey, JSON.stringify({ top, ranked }), 'EX', CACHE_TTL).catch(() => {});
  }

  // Where the player actually stands. Fetched even when they are in the top
  // 100 — the client should not have to work out whether to ask.
  const me = await myRank(board, userId);
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
