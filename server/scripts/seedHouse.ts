import { ensureSyntheticPool, syntheticSummary } from '../src/services/syntheticJurors.js';
import { prisma } from '../src/lib/prisma.js';

const r = await ensureSyntheticPool();
console.log('created:', r.created, '| existed before:', r.existing);
console.log(await syntheticSummary());
await prisma.$disconnect();
