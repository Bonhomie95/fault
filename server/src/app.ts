/**
 * The app, assembled but not listening.
 *
 * Split out of index.ts so tests can mount it with supertest. Previously the
 * only way to reach a route was to start a real server on a real port, which
 * is why every route in this codebase was verified by hand against a running
 * process and none of it was verified twice.
 */
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { env, isProduction } from './lib/env.js';
import { log, requestLog } from './lib/log.js';
import { globalLimiter } from './middleware/limits.js';
import { aiEnabled, availableCount, keyCount } from './lib/groq.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { authRouter } from './routes/auth.js';
import { caseRouter } from './routes/cases.js';
import { cityRouter } from './routes/city.js';
import { jurorRouter } from './routes/jurorProfile.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { reviewRouter } from './routes/review.js';
import { sessionRouter } from './routes/session.js';
import { standingRouter } from './routes/standing.js';
import { storeRouter } from './routes/store.js';
import { verdictRouter } from './routes/verdict.js';

const app = express();

app.use(helmet());

// Behind a load balancer the client IP is in X-Forwarded-For; without this the
// rate limiter keys every request to the proxy and throttles the whole world
// as one visitor.
app.set('trust proxy', 1);

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

app.use(express.json({ limit: '256kb' }));
app.use(requestLog);
app.use(globalLimiter);

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
