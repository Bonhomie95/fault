import { prisma } from '../src/lib/prisma.js';
import { cityVerdict, MIN_CASES_TO_RANK } from '../src/domain/peace.js';

const rows = await prisma.user.findMany({
  where: { isSynthetic: true, jurorProfile: { totalCases: { gte: MIN_CASES_TO_RANK } } },
  select: { jurorName: true, homeCountry: true, cityState: { select: { peaceIndex: true } },
            jurorProfile: { select: { totalCases: true } } },
});
const sorted = rows.sort((a, b) => (b.cityState!.peaceIndex) - (a.cityState!.peaceIndex));
const show = (list: typeof sorted, label: string) => {
  console.log(`\n${label}`);
  list.slice(0, 10).forEach((r, i) => {
    const p = r.cityState!.peaceIndex;
    console.log(`  ${String(i + 1).padStart(2)}  ${r.jurorName.padEnd(22)} ${r.homeCountry}  ${p.toFixed(1).padStart(5)}  ${cityVerdict(p).padEnd(13)} ${r.jurorProfile!.totalCases} cases`);
  });
};
show(sorted, 'MOST PEACEFUL');
show([...sorted].reverse(), 'MOST LAWLESS');

const bands: Record<string, number> = {};
for (const r of sorted) { const v = cityVerdict(r.cityState!.peaceIndex); bands[v] = (bands[v] ?? 0) + 1; }
console.log('\nDistribution across', sorted.length, 'ranked cities:');
for (const [k, v] of Object.entries(bands).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(3)}  ${'█'.repeat(Math.round(v / 3))}`);
}
await prisma.$disconnect();
