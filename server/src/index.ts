import { app } from './app.js';
import { env } from './lib/env.js';
import { aiEnabled, checkModelAvailable, keyCount } from './lib/groq.js';
import { log } from './lib/log.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

const server = app.listen(env.PORT, () => {
  log.info('listening', { port: env.PORT });
  log.info(
    aiEnabled ? 'case generation: groq' : 'case generation: hand-authored docket',
    aiEnabled ? { model: env.GROQ_MODEL, keys: keyCount, capacityPerDay: keyCount * 33 } : {},
  );

  /**
   * Confirm the model still exists.
   *
   * Not a formality. The configured model had been retired by the provider,
   * every generation was 404ing, every juror was silently receiving the same
   * six fallback cases, and /health still reported groq:true with five keys
   * available — because the keys WERE fine. Nothing in the system was wrong
   * except the one thing nothing checked.
   *
   * Behind the listen callback so a slow provider never delays the port
   * opening, and non-fatal because the fallback docket is a designed mode.
   */
  if (aiEnabled) {
    void checkModelAvailable().then((result) => {
      if (result.ok) return;
      log.error('CASE GENERATION IS DEGRADED — every case will be the fallback docket', {
        reason: result.reason,
        ...(result.available ? { availableModels: result.available } : {}),
      });
    });
  }
});

/**
 * Graceful shutdown.
 *
 * This used to call server.close() without awaiting it and then exit
 * immediately, which meant every request in flight was severed the moment the
 * orchestrator sent SIGTERM. On a rolling deploy that is a burst of failed
 * verdicts — and a verdict is the one request in this game a player cannot
 * simply retry, because the clock has already run.
 *
 * Now: stop accepting new connections, let the open ones finish, then close
 * the database and cache. The 15s cap exists because a hung request must not
 * be able to hold the whole deploy open; Kubernetes and friends will send
 * SIGKILL at 30s regardless, and losing the connection cleanup is worse.
 */
let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('shutting down', { signal });

  const forced = setTimeout(() => {
    log.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, 15_000);
  forced.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));

  try {
    await prisma.$disconnect();
    redis.disconnect();
  } catch (err) {
    log.error('shutdown cleanup failed', { err: (err as Error).message });
  }

  clearTimeout(forced);
  log.info('shutdown complete');
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

/**
 * Last resort.
 *
 * Node terminates on an unhandled rejection, and this server deliberately
 * fires background work with `void` — outcome writing, cache refills. Those
 * have .catch() handlers today, but "today" is doing a lot of work in that
 * sentence, and a process that dies silently mid-verdict with no log line is
 * the worst possible production failure. Log it, then let it die honestly
 * rather than limping on in an unknown state.
 */
process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (err) => {
  log.error('uncaught exception', { err: err.message, stack: err.stack });
  void shutdown('uncaughtException');
});
