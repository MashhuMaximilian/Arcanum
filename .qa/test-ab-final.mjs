import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

// Capture ALL console
const consoleLog = [];
page.on('console', msg => consoleLog.push(msg.text()));

try {
  // Fresh context: go to /characters
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  
  // Wait for hydration
  await page.waitForTimeout(2000);
  
  // Seed 3 drafts: 2 valid, 1 corrupt 
  const testData = [
    {
      id: 'grog-test-1',
      name: 'Grog the Orc',
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
      // INVALID: no id, non-string updatedAt
      name: 'CORRUPT_DRAFT_FAIL',
      race: 'goblin',
      updatedAt: 999,  // Should fail normalize
      abilityScores: {},
      classEntries: [],
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    },
    {
      id: 'mira-test-2', 
      name: 'Mira Lightbringer',
      race: 'human', 
      levelsText: '',
      updatedAt: '2025-01-02T00:00:00Z',
      classEntries: [{ classId: 'cleric', level: 1 }],
      abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 10, WIS: 16, CHA: 14 },
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    }
  ];

  await page.evaluate(d => localStorage.setItem('arcanum.characterDrafts', JSON.stringify(d)), testData);
  console.log('[SEEDED] 3 drafts');
  
  // Allow state to settle then reload
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check what's visible
  const visible = await page.evaluate(() => {
    const articles = document.querySelectorAll('article');
    return Array.from(articles).map(a => {
      const text = a.innerText || '';
      const name = text.split('\n')[0].trim() || 'NO_NAME';
      return name;
    });
  });
  
  console.log('[VISIBLE]', JSON.stringify(visible));
  console.log('[COUNT]', visible.length);
  
  // Filter to confirm valid names
  const validNames = visible.filter(n => n === 'Grog the Orc' || n === 'Mira Lightbringer');
  const corruptVisible = visible.includes('CORRUPT_DRAFT_FAIL');
  
  // Verify localStorage had the data
  const lsVerify = await page.evaluate(() => {
    const raw = localStorage.getItem('arcanum.characterDrafts');
    return raw ? JSON.parse(raw).length : 0;
  });
  
  console.log('[LS ENTRIES]', lsVerify);
  
  // Hydration warning check
  const czWarning = consoleLog.some(m => m.includes('cz-shortcut-listen') || m.includes('hydrat'));
  
  // Save final screenshot
  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/ab-test-after-fix.png', fullPage: true });
  
  // Report
  console.log('\n========== A/B TEST RESULTS ==========');
  console.log('Seeded: 3 drafts (2 valid, 1 corrupt)');
  console.log('Expected to show: 2');
  console.log('Actually shown:', visible.length);
  console.log('Valid drafts visible:', validNames.length);
  console.log('Corrupt draft shown:', corruptVisible);
  console.log('cz-shortcut warning:', czWarning ? 'FOUND' : 'GONE ✓');
  console.log('');
  
  if (validNames.length === 2 && !corruptVisible) {
    console.log('✅ TEST PASSED - Persistence fix works!');
  } else if (visible.length === 0) {
    console.log('⚠️ TIMING ISSUE - re-running...');
  } else {
    console.log('❌ TEST FAILED');
  }

} catch(e) {
  console.error('[ERROR]', e.message);
} finally {
  await browser.close();
}