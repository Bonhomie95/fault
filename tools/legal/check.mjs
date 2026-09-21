// Fails (exit 1) while any [BRACKETED PLACEHOLDER] remains in legal/*.md.
// Run before every store submission: node tools/legal/check.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'legal');
let missing = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md')) {
  readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\[[A-Z][A-Z /_-]{2,}\]/g)) {
      if (m[0] === '[BRACKETED PLACEHOLDER]') continue;
      console.log(`${f}:${i + 1}  ${m[0]}`);
      missing += 1;
    }
  });
}
if (missing) {
  console.error(`\n${missing} placeholder(s) left in legal/. Fill them, run tools/legal/sync.mjs, then submit.`);
  process.exit(1);
}
console.log('legal/: no placeholders left.');
