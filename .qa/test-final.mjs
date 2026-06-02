import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

// Capture console for hydration warnings
const consoleOutput = [];
page.on('console', msg => {
  const text = msg.text();
  consoleOutput.push('[' + msg.type() + '] ' + text);
});

try {
  // Fresh browser, fresh page
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  console.log('[OK] Page loaded');

  // Seed 3 drafts: 2 valid, 1 invalid (bad id / non-string updatedAt)
  const testData = [
    {
      id: 'draft-1',
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
      // INVALID: no id, numeric updatedAt - should be SKIPPED by the fix
      name: 'Bad Draft Invalid',
      race: 'elf',
      updatedAt: 99999, // non-string - should fail
      abilityScores: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 12 },
      classEntries: [],
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    },
    {
      id: 'draft-2', 
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

  await page.evaluate((data) => {
    localStorage.setItem('arcanum.characterDrafts', JSON.stringify(data));
    console.log('[SEEDED] 3 drafts (2 valid, 1 invalid)');
  }, testData);

  // Full reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Count displayed drafts
  const draftCount = await page.evaluate(() => {
    // Query all draft cards/articles in the list
    const articles = document.querySelectorAll('article');
    const names = Array.from(articles).map(a => a.innerText?.split('\n')[0]).filter(Boolean);
    const heading = document.querySelector('h2');
    return { count: names.length, names, heading: heading?.innerText };
  });

  console.log('[DRAFTS DISPLAYED]', JSON.stringify(draftCount));

  // Take screenshot
  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/ab-test-after-fix.png', fullPage: true });
  console.log('[SCREENSHOT] Saved to /Users/max/dev/Arcanum/.qa/ab-test-after-fix.png');

  // Check for cz-shortcut-listen warning specifically
  const czWarning = consoleOutput.find(line => line.includes('cz-shortcut-listen'));
  const hydrationWarning = consoleOutput.find(line => line.includes('hydrat'));

  console.log('\n=== VERIFICATION RESULTS ===');
  console.log('Expected drafts: 2');
  console.log('Displayed drafts:', draftCount.count);
  console.log('Draft names:', draftCount.names?.join(', ') || '(none)');
  console.log('cz-shortcut-listen warning:', czWarning ? 'FOUND' : 'GONE ✓');
  console.log('Other hydration warning:', hydrationWarning ? 'FOUND' : 'NONE ✓');
  console.log('Test', draftCount.count === 2 ? 'PASSED ✓✓' : 'NEEDS REVIEW');

} catch (err) {
  console.error('[ERROR]', err.message);
} finally {
  await browser.close();
}