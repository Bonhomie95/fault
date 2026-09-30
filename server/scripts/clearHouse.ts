import { clearSyntheticPool } from '../src/services/syntheticJurors.js';
import { prisma } from '../src/lib/prisma.js';
console.log('removed:', await clearSyntheticPool());
await prisma.$disconnect();
