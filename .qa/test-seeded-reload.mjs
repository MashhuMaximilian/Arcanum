import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

// Capture ALL console messages and network requests
page.on('console', msg => {
  const text = msg.text();
  if (text.includes('storage') || text.includes('draft') || text.includes('character') || text.includes('error') || text.includes('warning')) {
    console.log(`[CONSOLE ${msg.type()}]`, text);
  }
});

// Log all network requests
page.on('request', req => {
  if (req.url().includes('api') || req.url().includes('supabase') || req.url().includes('character')) {
    console.log('[REQUEST]', req.method(), req.url());
  }
});

page.on('response', res => {
  if (res.url().includes('api') || res.url().includes('supabase') || res.url().includes('character')) {
    console.log('[RESPONSE]', res.status(), res.url());
  }
});

try {
  // Clean slate: clear localStorage and go to page
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  
  // Clear any existing data and verify clean start
  await page.evaluate(() => {
    localStorage.removeItem('arcanum.characterDrafts');
    console.log('[CLEAN] Cleared localStorage');
  });

  // Now SEED the data BEFORE any load happens
  const testData = [
    {
      id: 'test-1',
      name: 'Grog the Orc Warrior',
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
      updatedAt: 12345, // should fail normalization
      abilityScores: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 12 },
      classEntries: [],
      inventoryItems: [],
      spellSelections: [],
      featuresAndFeats: []
    },
    {
      id: 'test-2', 
      name: 'Mira Cleric of Light',
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
    console.log('[SEEDED]', data.length, 'drafts to localStorage');
    console.log('[DATA]', JSON.stringify(data));
  }, testData);

  // Force a full page reload with networkidle
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check if data was loaded by examining the list container
  const pageState = await page.evaluate(() => {
    // Find the draft list element
    const listContainer = document.querySelector('[class*="grid"], [class*="draft-list"], article, h2');
    return {
      url: window.location.href,
      title: document.title,
      bodyText: document.body.innerText?.substring(0, 500),
      elements: listContainer ? listContainer.outerHTML?.substring(0, 300) : 'no list found'
    };
  });

  console.log('[PAGE STATE]', JSON.stringify(pageState, null, 2));
  
  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/test-seeded-reload.png', fullPage: true });
  console.log('[SCREENSHOT] Saved to /Users/max/dev/Arcanum/.qa/test-seeded-reload.png');

} catch (err) {
  console.error('[ERROR]', err.message);
  console.error(err.stack);
} finally {
  await browser.close();
}