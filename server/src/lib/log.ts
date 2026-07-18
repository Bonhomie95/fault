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
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};

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
