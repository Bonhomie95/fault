import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { isProduction } from './env.js';

/**
 * Logging.
 *
 * There was none. Every diagnostic in this codebase was a bare console.log or
 * console.error with no timestamp, no request id and no way to tell one
 * player's failing request from another's — which is survivable on a laptop
 * and useless the first time something breaks in production for one juror in
 * Lagos at three in the morning.
 *
 * JSON in production so a log shipper can index it; readable lines in
 * development so a human can. No dependency: a logging library is a reasonable
 * thing to add later, and not a reason to have nothing today.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const entry = { level, msg, time: new Date().toISOString(), ...fields };
  const line = isProduction ? JSON.stringify(entry) : `[${level}] ${msg} ${Object.keys(fields).length ? JSON.stringify(fields) : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => {
    emit('error', msg, fields);
    // Everything logged at error level is also offered to whatever error
    // tracker is wired in. One call site, so a real backend is a one-file
    // change — see `onError` below.
    for (const sink of sinks) {
      try {
        sink(msg, fields ?? {});
      } catch {
        // A reporter that throws must never take down the request that was
        // merely trying to log.
      }
    }
  },
};

/**
 * Where errors go, besides stdout.
 *
 * There is no error tracking on this server. The structured logger is good —
 * request ids, levels, JSON in production — and it writes to stdout with no
 * shipper configured, which means a 500 at three in the morning for one juror
 * in Lagos is a line nobody will ever read.
 *
 * This is the seam rather than the integration. Adding Sentry needs a DSN, an
 * account, and a decision about what this game is willing to send to a third
 * party; none of those belong in a code change. What belongs here is making
 * that decision cost one call:
 *
 *   import * as Sentry from '@sentry/node';
 *   onError((msg, fields) => Sentry.captureMessage(msg, { extra: fields }));
 *
 * NOTE for whoever wires it up: requestLog deliberately logs the route and
 * never the body, because bodies here hold juror names, provider tokens and
 * receipts. Keep that property. Case text must not go to a third-party log
 * store either — it is model-written content about invented people accused of
 * crimes, and shipping it off-site is a different privacy posture than anyone
 * has been told about.
 */
type ErrorSink = (msg: string, fields: Record<string, unknown>) => void;

const sinks: ErrorSink[] = [];

export function onError(sink: ErrorSink): void {
  sinks.push(sink);
}

/**
 * One line per request, after it finishes.
 *
 * The request id goes back to the client on every response, so a player can
 * report "it said error, id abc123" and that is enough to find the exact
 * request. Deliberately logs the route, never the body: the body holds juror
 * names, provider tokens and receipts.
 */
export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const id = randomUUID().slice(0, 8);
  const started = Date.now();
  res.setHeader('x-request-id', id);
  (req as Request & { id?: string }).id = id;

  res.on('finish', () => {
    const ms = Date.now() - started;
    const fields = {
      id,
      method: req.method,
      // req.path, not originalUrl: query strings are where ids end up.
      path: req.path,
      status: res.statusCode,
      ms,
      // Present only once authenticated, and it is our own id, not a provider's.
      ...(req.juror ? { userId: req.juror.userId } : {}),
    };
    if (res.statusCode >= 500) log.error('request failed', fields);
    else if (res.statusCode >= 400) log.warn('request rejected', fields);
    else if (ms > 2000) log.warn('request slow', fields);
    else log.info('request', fields);
  });

  next();
}
