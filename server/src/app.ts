/**
 * The app, assembled but not listening.
 *
 * Split out of index.ts so tests can mount it with supertest. Previously the
 * only way to reach a route was to start a real server on a real port, which
 * is why every route in this codebase was verified by hand against a running
 * process and none of it was verified twice.
 */
import compression from 'compression';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { env, isProduction } from './lib/env.js';
import { log, requestLog } from './lib/log.js';
import { identify } from './middleware/identify.js';
import { globalLimiter } from './middleware/limits.js';
import { aiEnabled, availableCount, keyCount } from './lib/groq.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { authRouter } from './routes/auth.js';
import { caseRouter } from './routes/cases.js';
import { cityRouter } from './routes/city.js';
import { jurorRouter } from './routes/jurorProfile.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { reportRouter } from './routes/report.js';
import { reviewRouter } from './routes/review.js';
import { sessionRouter } from './routes/session.js';
import { standingRouter } from './routes/standing.js';
import { storeRouter } from './routes/store.js';
import { verdictRouter } from './routes/verdict.js';

const app = express();

app.use(helmet());

/**
 * How far to believe X-Forwarded-For.
 *
 * This was `1`, unconditionally, on the reasoning that behind a load balancer
 * the real client IP is in the header. True — but the number is not a
 * formality, it is the whole security of every IP-keyed limit.
 *
 * Express skips this many hops from the RIGHT of the chain. Set it to 1 when
 * there is no proxy and the entire header is attacker-supplied, so `req.ip`
 * becomes whatever the caller wrote. That was reproduced: one authenticated
 * user rotating the header pushed 180 requests through a 120/min limit
 * untouched.
 *
 * So it is configuration now, defaulting to 0 — trust the socket, ignore the
 * header. Deployments set TRUST_PROXY_HOPS to the number of proxies actually
 * in front of them, which for most PaaS front ends is 2 or more, not 1.
 */
app.set('trust proxy', env.TRUST_PROXY_HOPS);

// Dossiers are dense text and the review screen sends ten at once. gzip is
// free on the server and meaningful on a phone with one bar.
app.use(compression());

/**
 * CORS.
 *
 * Was `cors()` — every origin, no questions. Now an allow-list, and in
 * production an empty list is a boot failure rather than a wildcard (see
 * lib/env). A native app sends no Origin at all, which is why a missing origin
 * is allowed: this list exists for browsers.
 */
const allowedOrigins = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // native clients, curl
      if (!isProduction && allowedOrigins.length === 0) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('origin not allowed'));
    },
    credentials: true,
  }),
);

app.use(requestLog);

/**
 * Order matters here, and it is the fix for the limiter bug.
 *
 * `identify` verifies the access token's signature (no database) so the
 * limiter has a stable per-juror key instead of a spoofable IP. It must come
 * BEFORE globalLimiter — that ordering is the entire point.
 *
 * `express.json` comes AFTER the limiter, not before. Parsing up to 256kb of
 * body for a request we are about to reject with a 429 is work an attacker
 * gets for free; the limiter should be the cheapest thing that can say no.
 */
app.use(identify);
app.use(globalLimiter);
app.use(express.json({ limit: '256kb' }));

app.get('/health', async (_req, res) => {
  // Key availability is operational truth: when it reaches 0 every juror on
  // the server is quietly playing the fallback docket.
  const checks = {
    postgres: false,
    redis: false,
    groq: aiEnabled,
    groqKeys: keyCount,
    groqKeysAvailable: availableCount(),
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = true;
  } catch {
    /* reported as false */
  }
  try {
    checks.redis = (await redis.ping()) === 'PONG';
  } catch {
    /* reported as false */
  }
  const ok = checks.postgres; // Redis and Groq are both degradable; Postgres is not.
  res.status(ok ? 200 : 503).json({ ok, ...checks });
});

app.use('/api/auth', authRouter);
app.use('/api/session', sessionRouter);
app.use('/api/standing', standingRouter);
app.use('/api/case', caseRouter);
app.use('/api/verdict', verdictRouter);
app.use('/api/city-state', cityRouter);
app.use('/api/review', reviewRouter);
app.use('/api/juror-profile', jurorRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/store', storeRouter);
app.use('/api/report', reportRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const id = (req as Request & { id?: string }).id;

  // CORS rejections are a client configuration problem, not a server fault,
  // and logging them at error level buries real 500s in noise from scanners.
  if (err.message === 'origin not allowed') {
    log.warn('cors rejected', { id, origin: req.header('origin') });
    res.status(403).json({ error: 'origin_not_allowed' });
    return;
  }

  // The stack goes to the log, never to the client: a stack trace names file
  // paths, package versions and query shapes, which is free reconnaissance.
  // The request id goes to both, so a bug report can be tied to a log line.
  log.error('unhandled', { id, err: err.message, stack: err.stack });
  res.status(500).json({ error: 'internal_error', requestId: id });
});

export { app };
