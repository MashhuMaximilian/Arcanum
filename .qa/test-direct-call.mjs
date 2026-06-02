import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

// Capture ALL console messages  
page.on('console', msg => {
  console.log(`[CONSOLE ${msg.type()}]`, msg.text());
});

try {
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  console.log('[OK] Page loaded');

  // Inject test data
  const testData = [
    {
      id: 'test-1',
      name: 'Grog',
      race: 'orc',
      levelsText: '',
      updatedAt: '2025-01-01T00:00:00Z',
      classEntries: [],
      abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 10, CHA: 8 },
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    },
    {
      // INVALID: no id, numeric updatedAt
      name: 'Bad elf',
      race: 'elf',
      updatedAt: 12345,
      abilityScores: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 12 },
      classEntries: [],
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    },
    {
      id: 'test-2', 
      name: 'Mira',
      race: 'human', 
      levelsText: '',
      updatedAt: '2025-01-02T00:00:00Z',
      classEntries: [{ classId: 'cleric', level: 1 }],
      abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 10, WIS: 16, CHA: 10 },
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    }
  ];

  await page.evaluate((data) => {
    localStorage.setItem('arcanum.characterDrafts', JSON.stringify(data));
    console.log('Seeded localStorage:', data.length, 'entries');
  }, testData);

  // Reload to trigger loading
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Now directly call the storage function from the page
  // First, let's see what's loaded in webpack module map
  const storageResult = await page.evaluate(() => {
    // @ts-ignore
    const storage = require('/lib/characters/storage');
    return storage.listCharacterDrafts();
  });

  console.log('[DIRECT STORAGE CALL] Result:', JSON.stringify(storageResult, null, 2));

  // Alternative: just call the function if exposed globally
  const globalResult = await page.evaluate(() => {
    // @ts-ignore  
    if (window.__NEXT_DATA__) {
      return { note: 'SSR data found' };
    }
    return { note: 'no SSR data' };
  });
  
  console.log('[GLOBAL CHECK]', globalResult);

  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/test-direct-call.png', fullPage: true });
  console.log('[OK] Screenshot saved');

} catch (err) {
  console.error('[ERROR]', err.message);
} finally {
  await browser.close();
}