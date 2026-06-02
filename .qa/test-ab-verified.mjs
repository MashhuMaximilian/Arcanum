import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleLog = [];
page.on('console', msg => consoleLog.push(msg.text()));

try {
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Seed 3: 2 VALID, 1 CORRUPT (missing id, non-string updatedAt)
  const testData = [
    {
      id: 'valid-grog',
      name: 'Grog Ironfist',
      race: 'orc',
      levelsText: '',
      updatedAt: '2025-01-01T00:00:00Z',
      classEntries: [],
      abilityScores: { STR: 18, DEX: 10, CON: 16, INT: 6, WIS: 10, CHA: 8 },
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    },
    {
      // BAD: NO id, wrong updatedAt type - should be filtered!
      name: 'BAD_CORRUPT_ROW',
      race: 'kobold',
      updatedAt: 42,
      abilityScores: {},
      classEntries: [],
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    },
    {
      id: 'valid-mira',
      name: 'Mira Sunweaver',
      race: 'human',
      levelsText: '',
      updatedAt: '2025-01-02T00:00:00Z',
      classEntries: [{ classId: 'cleric', level: 3 }],
      abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 10, WIS: 18, CHA: 14 },
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    }
  ];

  await page.evaluate(d => localStorage.setItem('arcanum.characterDrafts', JSON.stringify(d)), testData);

  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // Get visible drafts
  const visible = await page.evaluate(() => {
    const arts = document.querySelectorAll('article');
    return Array.from(arts).map(a => (a.innerText || '').split('\n')[0].trim()).filter(Boolean);
  });

  console.log('[VISIBLE]', JSON.stringify(visible));
  console.log('[COUNT]', visible.length);

  // Verify no corrupt
  const hasCorrupt = visible.includes('BAD_CORRUPT_ROW');
  const hasGrog = visible.includes('Grog Ironfist');
  const hasMira = visible.includes('Mira Sunweaver');

  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/ab-test-after-fix.png', fullPage: true });

  // Verify ls input
  const lsIn = await page.evaluate(() => JSON.parse(localStorage.getItem('arcanum.characterDrafts')).length);
  console.log('[INPUT LS]', lsIn, 'entries');

  const czWarn = consoleLog.some(m => m.includes('cz-shortcut-listen') || m.includes('hydrat'));

  console.log('\n========== FINAL A/B TEST ==========');
  console.log('Input: 3 drafts (2 valid + 1 corrupt)');
  console.log('Output:', visible.length, 'drafts');
  console.log('Shows Grog?', hasGrog);
  console.log('Shows Mira?', hasMira);
  console.log('Shows corrupt?', hasCorrupt);
  console.log('Hydration warning?', czWarn ? 'YES' : 'NONE ✓');

  if (hasGrog && hasMira && !hasCorrupt && visible.length === 2) {
    console.log('\n✅ TEST PASSED - Filter works correctly!');
  } else {
    console.log('\n⚠️ Review needed');
  }

} catch(e) {
  console.error('[ERR]', e.message);
} finally {
  await browser.close();
}