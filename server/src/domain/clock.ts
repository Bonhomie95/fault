/**
 * The clock.
 *
 * 120 seconds. For everyone, for every case, everywhere. There are no tiers,
 * no accessibility extensions, no per-user override — the previous
 * `user.clockSeconds` column is gone, because a number the client could read
 * was a number the client could argue with.
 *
 * It lives here, alone, for two reasons.
 *
 * The first is authority. This value is now the *only* input to how long a
 * juror has, and it is applied server-side against `Case.servedAt`. The client
 * is told how many seconds are left; it is never asked. Previously the phone
 * owned the clock outright, which meant a player could report 119 seconds
 * remaining on every verdict, or reload the case screen and start the 120
 * again with the dossier already read. The clock is the entire thesis of the
 * game — "no case can be fully read in the time given" (GDD 2.1) — and a
 * thesis the player can edit is a suggestion.
 *
 * The second is that this will change. The GDD lists extended timers as its
 * accessibility mitigation for timer stress (§12), and removing them is a
 * real accessibility cost that is currently accepted on purpose. When that
 * comes back, it comes back here: one constant, one grace allowance, and the
 * enforcement below keeps working untouched.
 */
export const CLOCK_SECONDS = 120;

/**
 * Slack given to every deadline.
 *
 * Covers the round trip, a slow render, and a phone whose clock disagrees with
 * ours. Without it, a juror who taps GUILTY at 119.6s by their screen gets a
 * forced hung verdict by ours, and blames the game — correctly. Generous
 * enough to be invisible, small enough to be useless as an exploit.
 */
export const CLOCK_GRACE_SECONDS = 3;

export interface ClockState {
  /** Seconds left, floored at 0. The number the client displays. */
  remaining: number;
  /** True once the window has closed (including grace). */
  expired: boolean;
  /** Seconds spent. What the player actually gave the case. */
  elapsed: number;
}

/**
 * The truth about a case's clock, computed from when we served it.
 *
 * A case that has never been served has its full window; that is the state
 * immediately before the first read.
 */
export function clockFor(servedAt: Date | null, now: Date = new Date()): ClockState {
  if (!servedAt) return { remaining: CLOCK_SECONDS, expired: false, elapsed: 0 };

  const rawElapsed = Math.floor((now.getTime() - servedAt.getTime()) / 1000);

  // A servedAt in the future is impossible and therefore real: clock skew
  // between the app server and the database, or a hand-written row. Clamping
  // it to zero elapsed would hand the player a clock that never runs out —
  // the exploit this file exists to close, arriving by accident. Treat it as
  // just-served instead, which costs an honest player nothing and costs a
  // skewed clock only its skew.
  //
  // (Timebase note: `servedAt` is `TIMESTAMP` without a zone, and Prisma reads
  // and writes it in UTC. Any raw SQL touching it must use
  // `now() at time zone 'utc'` — a plain `now()` writes local wall time and
  // silently shifts the deadline by your offset.)
  const elapsed = rawElapsed < 0 ? 0 : rawElapsed;
  const remaining = Math.max(0, CLOCK_SECONDS - elapsed);

  return {
    remaining,
    expired: elapsed > CLOCK_SECONDS + CLOCK_GRACE_SECONDS,
    elapsed,
  };
}
