// Build a PDF from the user's actual rangies-arcanum-build.json by running
// the full draft → catalogs → buildPdfCharacterFromDraft → generatePdfBytes
// pipeline. This mirrors what the client does in builder-editor.tsx's
// useMemo, but in a single Node script so we can verify the rendered output
// (combat spell tracker overlap, proficiency truncation, 3-column item
// descriptions, etc.) without going through HTTP.

import { readFile, writeFile } from 'node:fs/promises';

import { buildPdfCharacterFromDraft } from '../web/lib/pdf/from-builder.ts';
import { generatePdfBytes } from '../web/lib/pdf/generate.ts';
import { loadPdfSvgAssetBundle } from '../web/lib/pdf/svg-assets.server.ts';

import { getBuiltInSrdBackgroundElements, getBuiltInSrdBackgrounds } from '../web/lib/builtins/backgrounds.ts';
import { getBuiltInSrdClasses, getBuiltInSrdClassElements } from '../web/lib/builtins/classes.ts';
import { getBuiltInSrdFeats } from '../web/lib/builtins/feats.ts';
import { getBuiltInSrdRaces, getBuiltInSrdRaceElements } from '../web/lib/builtins/races.ts';
import { getBuiltInSrdCompanions, getBuiltInSrdCompanionSubElements } from '../web/lib/builtins/srd-companions.ts';
import { getBuiltInSrdSpells } from '../web/lib/builtins/spells.ts';

const PDF_EXPORT_ASSET_KEYS = [
  "frontPageHeader",
  "frontPageHeaderShell",
  "hpPanel",
  "passivesAndSpeeds",
  "weaponAttacks",
  "generalContainer",
  "weaponBg",
  "greyBackground",
  "proficiencyBoolean",
  "proficiencyBox0",
  "proficiencyBox1",
  "line",
  "skillLine",
  "statBlock",
  "hitDie",
  "bonusBox",
  "ac",
  "hp",
  "passiveBox",
  "skillBlock",
  "abilityPanel",
];

const catalogs = {
  backgrounds: getBuiltInSrdBackgrounds(),
  classes: getBuiltInSrdClasses(),
  feats: getBuiltInSrdFeats(),
  races: getBuiltInSrdRaces(),
  spells: getBuiltInSrdSpells(),
  progressionElements: [
    ...getBuiltInSrdRaceElements(),
    ...getBuiltInSrdClassElements(),
    ...getBuiltInSrdBackgroundElements(),
    ...getBuiltInSrdCompanions(),
    ...getBuiltInSrdCompanionSubElements(),
  ],
};

const raw = await readFile('/Users/max/Downloads/rangies-arcanum-build.json', 'utf8');
const build = JSON.parse(raw);

const character = buildPdfCharacterFromDraft({ ...catalogs, draft: build });

console.log('=== Combat & Spellcasting ===');
console.log('hasSpells:', character.frontPage?.combatHub?.hasSpells);
const spellCol = character.frontPage?.combatHub?.spellColumn;
if (spellCol) {
  console.log('slots maxLevel:', spellCol.slots?.maxLevel);
  console.log('cantrips:', spellCol.cantrips?.map(c => c.name).join('; '));
  console.log('spellsByLevel:');
  for (const entry of spellCol.spellsByLevel ?? []) {
    if (entry.spells.length) console.log(`  L${entry.level}: ${entry.spells.map(s => s.name).join(', ')}`);
  }
}

console.log('\n=== Proficiencies ===');
const profs = character.frontPage?.proficiencyGroups;
if (profs) {
  console.log('weapons:', JSON.stringify(profs.weapons, null, 2));
  console.log('armor:', JSON.stringify(profs.armor, null, 2));
  console.log('tools:', JSON.stringify(profs.tools, null, 2));
}

console.log('\n=== Headers / Page layout ===');
console.log('header fields:', character.frontPage?.header?.fields?.map(f => `${f.label}=${f.value}`).join(' | '));

const svgAssets = await loadPdfSvgAssetBundle([...PDF_EXPORT_ASSET_KEYS]);
const pdf = await generatePdfBytes(character, svgAssets);
await writeFile('/Users/max/dev/Arcanum/.qa/rangies-user.pdf', Buffer.from(pdf));
console.log(`\nwrote ${pdf.length} bytes to .qa/rangies-user.pdf`);
