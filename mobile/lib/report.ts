/**
 * Where errors go.
 *
 * There is no crash reporting in this app and there was none in the server
 * either: no Sentry, no Bugsnag, nothing. The root ErrorBoundary is in place
 * and correct, and when it catches something in a release build, nobody will
 * ever know it happened.
 *
 * This file is the seam. It is deliberately NOT a Sentry integration: adding
 * an SDK requires a DSN, an account and a decision about what telemetry this
 * game is willing to collect, and none of those are mine to make. What it does
 * is make that decision a one-file change instead of a twenty-call-site one —
 * every place worth reporting from now calls `reportError`, so wiring a real
 * backend means editing `deliver` below and nothing else.
 *
 * Until then it logs in development and swallows in production, which is
 * exactly what happened before — except that now there is one place to change
 * it, and the call sites already exist.
 *
 * WHAT MUST NEVER GO IN HERE, whatever backend is wired in later:
 *
 *   - dossier text, testimony, or any part of a case. It is model-generated
 *     content about invented people accused of crimes; shipping it to a
 *     third-party log store is a different privacy posture than this game has
 *     told anyone about.
 *   - juror names. They are user-chosen and published, but a crash report is
 *     not the registry.
 *   - access or refresh tokens, obviously.
 *
 * The userId is fine and is the thing that makes a report actionable: it is
 * our own opaque id, it appears in the server's request log already, and it is
 * what turns "someone crashed" into "this player crashed, here is their
 * request".
 */

type Context = Record<string, string | number | boolean | null | undefined>;

let currentUserId: string | null = null;

/**
 * Things that are not incidents.
 *
 * A crash tracker is only useful if somebody still reads it in week three, and
 * the fastest way to guarantee nobody does is to fill it with events the app
 * already handles correctly by design.
 *
 * All four of these are normal:
 *
 *   offline / timeout   — a phone on a train. The app shows "could not reach
 *                         the court" and the player tries again.
 *   token_invalid /     — a session that expired, was revoked, or belongs to a
 *   unauthorized          deleted account. bootstrap clears the tokens and
 *                         shows the cold open. That IS the flow.
 *
 * I found this the honest way: wiring the seam up and immediately watching it
 * report "Your session has expired" on a perfectly ordinary relaunch.
 *
 * Note what is deliberately NOT here: bad_response. HTML where JSON should be
 * means a proxy, a captive portal, or a deploy gone wrong, and that is worth
 * knowing about.
 */
const ROUTINE = new Set(['offline', 'timeout', 'token_invalid', 'unauthorized']);

function isRoutine(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && ROUTINE.has(code);
}

/** Attach the signed-in juror to everything reported after this. */
export function setReportingUser(userId: string | null): void {
  currentUserId = userId;
}

/**
 * The one function to replace when a real backend arrives.
 *
 * e.g. `Sentry.captureException(error, { extra: { ...context, userId } })`
 */
function deliver(error: unknown, context: Context): void {
  if (__DEV__) {
    // In development a console line IS the reporting backend, and a loud one
    // is more useful than a silent upload.
    console.error('[report]', error, context);
  }
  // Production: nothing yet, on purpose. See the note above.
}

/**
 * Report something that went wrong but did not stop the app.
 *
 * `where` should name the operation, not the file — "loadCase", "submitVerdict"
 * — because that is what you will be searching for at three in the morning.
 */
export function reportError(where: string, error: unknown, context: Context = {}): void {
  // Expected conditions the app already handles are not reports. See ROUTINE.
  if (isRoutine(error)) return;

  try {
    deliver(error, {
      where,
      userId: currentUserId,
      message: error instanceof Error ? error.message : String(error),
      ...context,
    });
  } catch {
    // Reporting must never be the thing that crashes the app. If the reporter
    // throws, the original error was still the more important one.
  }
}

/**
 * Report a render crash caught by the root ErrorBoundary.
 *
 * Separate from reportError because this one is always fatal to the screen —
 * the player is looking at the error page right now — and a backend will want
 * to grade it differently.
 */
export function reportFatal(error: Error, context: Context = {}): void {
  reportError('render', error, { ...context, fatal: true });
}
