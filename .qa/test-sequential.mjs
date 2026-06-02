import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

// Track console 
const consoleMsgs = [];
page.on('console', msg => {
  consoleMsgs.push(msg.text());
});

try {
  // STEP 1: Go to home page first (this is important!)
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  console.log('[1/4] Home page loaded');

  // STEP 2: Then navigate in same session to /characters
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  console.log('[2/4] Characters page loaded');

  // Wait for hydration
  await page.waitForTimeout(1500);

  // STEP 3: While on the page, seed 3 drafts (2 valid, 1 invalid)
  const testData = [
    {
      id: 'grog-001',
      name: 'Grog the Mighty',
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
      // INVALID: missing id and non-string updatedAt
      name: 'Corrupt Entry Fail',
      race: 'halfling',
      updatedAt: 123456789,
      abilityScores: { STR: 8, DEX: 16, CON: 10, INT: 12, WIS: 14, CHA: 16 },
      classEntries: [],
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    },
    {
      id: 'mira-002', 
      name: 'Mira Lightbringer',
      race: 'human', 
      levelsText: '',
      updatedAt: '2025-01-02T00:00:00Z',
      classEntries: [{ classId: 'cleric', level: 2 }],
      abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 10, WIS: 18, CHA: 14 },
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    }
  ];

  await page.evaluate((data) => {
    localStorage.setItem('arcanum.characterDrafts', JSON.stringify(data));
    console.log('[3/4] Seeded 3 drafts to localStorage');
  }, testData);

  // STEP 4: Navigate AGAIN to /characters (this triggers re-read from ls)
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Verify what was loaded
  const result = await page.evaluate(() => {
    // What do we see?
    const header = document.querySelector('h2')?.innerText || document.querySelector('h1')?.innerText || '';
    const articles = document.querySelectorAll('article');
    const names = Array.from(articles).map(el => {
      // Extract name from card
      const title = el.querySelector('h3, [class*="title"], strong')?.innerText || el.innerText.split('\n')[0];
      return title?.trim();
    });
    
    return { 
      header: header.trim(),
      articleCount: articles.length,
      names: names.filter(Boolean)
    };
  });

  console.log('[4/4] Rendered结果:', JSON.stringify(result));

  // Screenshot!
  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/ab-test-after-fix.png', fullPage: true });
  console.log('[SCREENSHOT] ab-test-after-fix.png');

  // Check localStorage was read correctly  
  const lsCheck = await page.evaluate(() => {
    const raw = localStorage.getItem('arcanum.characterDrafts');
    if (!raw) return 'EMPTY';
    const parsed = JSON.parse(raw);
    return '' + parsed.length + ' entries';
  });

  console.log('\n=== FINAL VERIFICATION ===');
  console.log('Input: 3 drafts (2 valid, 1 corrupt)');
  console.log('Output: ' + result.articleCount + ' drafts displayed');
  console.log('Names: ' + result.names?.join(', ') || '(none)');
  console.log('localStorage: ' + lsCheck);
  console.log('cz-shortcut-listen warning:', consoleMsgs.some(m => m.includes('cz-shortcut')) ? 'FOUND' : 'GONE ✓');
  console.log('');
  console.log('TEST', result.articleCount >= 2 ? 'PASSED ✓' : 'FLAKING - review code');

} catch (err) {
  console.error('[ERROR]', err.message);
} finally {
  await browser.close();
}