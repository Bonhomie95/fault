import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { env, isProduction } from './lib/env.js';
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

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal error' });
});

const server = app.listen(env.PORT, () => {
  console.log(`FAULT api listening on :${env.PORT}`);
  console.log(
    aiEnabled
      ? `Case generation: Groq (${env.GROQ_MODEL}) — ${keyCount} key${keyCount === 1 ? '' : 's'} in rotation, ~${keyCount * 33} cases/day`
      : 'Case generation: hand-authored docket (no Groq keys set)',
  );
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
