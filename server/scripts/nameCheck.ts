import { prisma } from '../src/lib/prisma.js';
const rows = await prisma.user.findMany({ where: { isSynthetic: true }, select: { jurorName: true, homeCountry: true } });
const per = new Map<string, number>();
for (const r of rows) {
  const k = `${r.homeCountry}:${r.jurorName.slice(r.jurorName.indexOf(' ') + 1)}`;
  per.set(k, (per.get(k) ?? 0) + 1);
}
const worst = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log('most-repeated surname per country:', worst.map(([k, v]) => `${k} x${v}`).join(', '));
console.log('distinct names:', new Set(rows.map((r) => r.jurorName)).size, 'of', rows.length);
await prisma.$disconnect();
