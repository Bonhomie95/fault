import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { aiEnabled, env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { caseRouter } from './routes/cases.js';
import { cityRouter } from './routes/city.js';
import { jurorRouter } from './routes/jurorProfile.js';
import { reviewRouter } from './routes/review.js';
import { sessionRouter } from './routes/session.js';
import { verdictRouter } from './routes/verdict.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/health', async (_req, res) => {
  const checks = { postgres: false, redis: false, groq: aiEnabled };
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

app.use('/api/session', sessionRouter);
app.use('/api/case', caseRouter);
app.use('/api/verdict', verdictRouter);
app.use('/api/city-state', cityRouter);
app.use('/api/review', reviewRouter);
app.use('/api/juror-profile', jurorRouter);

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
      ? `Case generation: Groq (${env.GROQ_MODEL})`
      : 'Case generation: hand-authored docket (no GROQ_API_KEY set)',
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
