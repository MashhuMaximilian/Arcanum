import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleLog = [];
page.on('console', msg => consoleLog.push(msg.text()));

try {
  // Load page
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Seed 3: 2 valid, 1 corrupt
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
      // BAD - missing id and name is clearly broken
      race: 'goblin',
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
  console.log('[SEEDED] 3 drafts');

  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // Check visible
  const visible = await page.evaluate(() => {
    const arts = document.querySelectorAll('article');
    return Array.from(arts).map(a => a.innerText.split('\n')[0].trim());
  });

  console.log('[DISPLAYED]', JSON.stringify(visible));

  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/ab-test-after-fix.png', fullPage: true });
  console.log('[SCREENSHOT] .qa/ab-test-after-fix.png');

  // Check logs
  const storageLogs = consoleLog.filter(m => m.includes('[storage]'));
  console.log('\n[STORAGE LOGS]');
  storageLogs.forEach(l => console.log(' ', l));

  console.log('\n========== FINAL A/B VERIFICATION ==========');
  console.log('Input: 3 drafts (2 valid, 1 corrupt missing id/name)');
  console.log('Expected output: 2 (Grog + Mira)');
  console.log('Actual output:', visible.length);
  console.log('Drafts:', visible.join(', '));
  
  const pass = visible.length === 2 && visible.includes('Grog Ironfist') && visible.includes('Mira Sunweaver');
  console.log('\n' + (pass ? '✅ PASSED' : '❌ FAILED'));

} catch(e) {
  console.error('[ERR]', e.message);
} finally {
  await browser.close();
}