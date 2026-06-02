import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  // FIRST: Visit home page
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  console.log('[OK] Home page loaded');

  // THEN: Navigate directly to /characters
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  console.log('[OK] Characters page loaded');

  // Wait for hydration
  await page.waitForTimeout(2000);

  // Grab localStorage right now, without any seeding
  const beforeState = await page.evaluate(() => {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      entries.push({ key, value: key ? localStorage.getItem(key)?.substring(0, 100) : null });
    }
    return entries;
  });
  console.log('[LOCALSTORAGE BEFORE SEED]', JSON.stringify(beforeState));

  // Now seed data while on the page
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
    console.log('[SEEDED] Set data');
  }, testData);

  const afterSeed = await page.evaluate(() => {
    return localStorage.getItem('arcanum.characterDrafts')?.substring(0, 150);
  });
  console.log('[VERIFY AFTER SET]', afterSeed?.substring(0, 200));

  // Re-fetch the /characters route using the SAME browser session
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Check state after navigation
  const afterNav = await page.evaluate(() => {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      entries.push({ key, value: key ? localStorage.getItem(key)?.substring(0, 100) : null });
    }
    return entries;
  });
  console.log('[LOCALSTORAGE AFTER NAV]', JSON.stringify(afterNav));

  // Check what's rendered
  const rendered = await page.evaluate(() => document.body.innerText?.substring(0, 800));
  console.log('[RENDERED TEXT]', rendered);

  console.log('[CHECK COMPLETE]');

  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/test-full-cycle.png', fullPage: true });

} catch (err) {
  console.error('[ERROR]', err.message);
} finally {
  await browser.close();
}