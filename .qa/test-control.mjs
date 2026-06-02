import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // CONTROL: Just 2 valid drafts, NO corrupt data
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

  const visible = await page.evaluate(() => {
    const arts = document.querySelectorAll('article');
    return Array.from(arts).map(a => a.innerText.split('\n')[0].trim());
  });

  console.log('[CONTROL TEST]');
  console.log('Visible:', visible);
  console.log('Count:', visible.length);
  
  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/control-2valid.png', fullPage: true });

} catch(e) {
  console.error(e.message);
} finally {
  await browser.close();
}