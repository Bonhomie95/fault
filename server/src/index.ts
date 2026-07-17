import { app } from './app.js';
import { env } from './lib/env.js';
import { aiEnabled, keyCount } from './lib/groq.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

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
