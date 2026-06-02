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

  // Inject the mixed valid/invalid draft data
  const testData = [
    {
      id: 'valid-1',
      name: 'Grog',
      race: 'orc',
      levelsText: '',
      updatedAt: '2025-01-01T00:00:00Z',
      classEntries: [],
      abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      inventoryItems: [],
      spellSelections: []
    },
    {
      // INVALID: no id, numeric updatedAt
      name: 'BAD_DRAFT_NO_ID',
      race: 'elf',
      updatedAt: 123,
      abilityScores: {},
      classEntries: [],
      inventoryItems: [],
      spellSelections: []
    },
    {
      id: 'valid-2',
      name: 'Mira',
      race: 'human',
      levelsText: '',
      updatedAt: '2025-01-02T00:00:00Z',
      classEntries: [{ classId: 'cleric', level: 1 }],
      abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 10, WIS: 14, CHA: 10 },
      inventoryItems: [],
      spellSelections: []
    }
  ];

  await page.evaluate((data) => {
    localStorage.setItem('arcanum.characterDrafts', JSON.stringify(data));
  }, testData);

  console.log('[OK] Seeded localStorage with 3 drafts (2 valid, 1 invalid)');

  // Reload the page to trigger loading
  await page.reload({ waitUntil: 'networkidle' });
  
  // Wait a moment for React to hydrate
  await page.waitForTimeout(2000);

  // Call the listCharacterDrafts function directly
  const draftsResult = await page.evaluate(() => {
    // Check what's displayed
    const listEl = document.querySelector('.draft-list');
    if (listEl) {
      const articles = listEl.querySelectorAll('article');
      return {
        count: articles.length,
        names: Array.from(articles).map(a => a.textContent?.substring(0, 50))
      };
    }
    const noDraftsMsg = document.querySelector('.route-shell__copy, .builder-panel__copy');
    if (noDraftsMsg) {
      return { count: 0, message: noDraftsMsg.textContent };
    }
    return { count: -1, message: 'Could not find draft list or empty message' };
  });

  console.log('[RESULT] Drafts displayed:', JSON.stringify(draftsResult));

  // Take screenshot
  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/ab-test-after-fix.png', fullPage: true });
  console.log('[OK] Screenshot saved to /Users/max/dev/Arcanum/.qa/ab-test-after-fix.png');

  // Check for hydration warning
  const hydrationWarnings = consoleLogs.filter(log => 
    log.text.includes('cz-shortcut-listen') || 
    log.text.includes('hydration') ||
    log.text.includes('Warning:')
  );
  
  if (hydrationWarnings.length > 0) {
    console.log('[WARN] Hydration-related warnings found:');
    hydrationWarnings.forEach(w => console.log('  -', w.text));
  } else {
    console.log('[OK] No hydration warnings in console');
  }

  // Summary
  console.log('\n=== A/B TEST RESULT ===');
  console.log('Valid drafts expected: 2');
  console.log('Valid drafts found:', draftsResult.count);
  console.log('Test', draftsResult.count === 2 ? 'PASSED ✓' : 'FAILED ✗');

} catch (err) {
  console.error('[ERROR]', err.message);
} finally {
  await browser.close();
}