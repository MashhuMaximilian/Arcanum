// POST user rangies-arcanum-build.json to /pdf-export-draft (full draft
// pipeline). Mirrors build-user-pdf.mjs but uses the route that runs
// buildPdfCharacterFromDraft on the server. Used to verify R30 fixes
// against the user's actual character data.
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const characterPath = process.argv[2] || '/Users/max/Downloads/rangies-arcanum-build.json';
const outPath = process.argv[3] || '/Users/max/dev/Arcanum/.qa/rangies-user.pdf';

const raw = await readFile(characterPath, 'utf8');
const build = JSON.parse(raw);

console.log('→ POST /pdf-export-draft');
const res = await fetch('http://localhost:3000/pdf-export-draft', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(build),
});
console.log(`  status=${res.status} content-type=${res.headers.get('content-type')}`);
if (!res.ok) {
  const t = await res.text();
  console.error('ERROR:', t.slice(0, 2000));
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
console.log(`  bytes=${buf.length}`);
await writeFile(outPath, buf);
console.log(`  saved ${outPath}`);

console.log('→ convert PDF to PNG (page 1 only)');
try {
  execSync(`pdftoppm -png -r 200 -f 1 -l 1 ${outPath} ${outPath.replace('.pdf', '-p1')}`, { stdio: 'inherit' });
} catch (e) {
  console.log('  pdftoppm failed:', e.message);
}