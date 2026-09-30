import { getBoard } from '../src/services/leaderboard.js';
import { prisma } from '../src/lib/prisma.js';
const v = await getBoard('peaceful', 'nobody');
console.log('ranked cities:', v.ranked, '| qualifyAt:', v.qualifyAt, '| top returned:', v.top.length);
console.log('top 5 through the REAL query:');
for (const e of v.top.slice(0, 5)) console.log(`  ${e.rank}  ${e.jurorName.padEnd(22)} ${e.country}  ${e.peaceIndex.toFixed(1)}  ${e.verdict}  ${e.casesHeard} cases`);
await prisma.$disconnect();
// getBoard caches in Redis, whose connection keeps the process alive.
const { redis } = await import('../src/lib/redis.js');
redis.disconnect();
