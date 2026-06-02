import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

// Capture console messages
const consoleLogs = [];
page.on('console', msg => {
  consoleLogs.push({ type: msg.type(), text: msg.text() });
});

try {
  // Navigate to /characters
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  console.log('[OK] Page loaded');

  // Inject the test data FIRST, before the component loads
  const testData = [
    {
      id: 'test-1',
      name: 'Grog the Orc',
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
      name: 'Bad Elf No ID',
      race: 'elf',
      updatedAt: 12345,  // Should fail - non-string
      abilityScores: {},
      classEntries: [],
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    },
    {
      id: 'test-2', 
      name: 'Mira Cleric',
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

  // Check what's in localStorage before setting
  const beforeSet = await page.evaluate(() => localStorage.getItem('arcanum.characterDrafts'));
  console.log('[DEBUG] localStorage BEFORE set:', beforeSet ? 'exists' : 'null');

  await page.evaluate((data) => {
    localStorage.setItem('arcanum.characterDrafts', JSON.stringify(data));
  }, testData);

  const afterSet = await page.evaluate(() => localStorage.getItem('arcanum.characterDrafts'));
  console.log('[DEBUG] localStorage AFTER set:', afterSet ? 'valid JSON' : 'failed');

  // Reload to force re-read
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // NOW call listCharacterDrafts directly - find it in the global scope
  const directCallResult = await page.evaluate(() => {
    // Try to access the module or helper functions
    // Since this is a Next.js SSR page, let's just manually get from localStorage
    const key = 'arcanum.characterDrafts';
    const raw = localStorage.getItem(key);
    if (!raw) return { error: 'no raw data', drafts: [] };
    
    try {
      const parsed = JSON.parse(raw);
      const drafts = [];
      for (const draft of parsed) {
        try {
          // validate/skip missing id
          if (!draft.id) {
            console.warn('Skipping draft missing id:', draft.name);
            continue;
          }
          // validate updatedAt is string
          if (typeof draft.updatedAt !== 'string') {
            console.warn('Skipping draft with non-string updatedAt:', draft.name, draft.updatedAt);
            continue;
          }
          drafts.push(draft);
        } catch(e) {
          console.warn('Error normalizing draft:', draft.id, e.message);
        }
      }
      return { drafts: drafts.map(d => ({ id: d.id, name: d.name, updatedAt: d.updatedAt })) };
    } catch(e) {
      return { error: e.message, drafts: [] };
    }
  });

  console.log('[DIRECT CALL] Result:', JSON.stringify(directCallResult, null, 2));

  // Get the page content to see what's rendered
  const htmlContent = await page.evaluate(() => document.body.innerHTML.substring(0, 2000));
  console.log('[HTML] Body preview:', htmlContent);

  // Take screenshot
  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/ab-test-debug.png', fullPage: true });
  console.log('[OK] Screenshot saved');

} catch (err) {
  console.error('[ERROR]', err.message);
  console.error(err.stack);
} finally {
  await browser.close();
}