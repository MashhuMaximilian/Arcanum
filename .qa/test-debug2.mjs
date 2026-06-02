import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

try {
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  console.log('[A] Loaded');
  
  await page.waitForTimeout(3000);
  
  // Simple seed 
  const data = [
    {id:'x1',name:'CharOne',race:'human',updatedAt:'2025-01-01T00:00:00Z',levelsText:'',classEntries:[],abilityScores:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},inventoryItems:[],spellSelections:[],featuresAndFeats:[]},
    {id:'x2',name:'CharTwo',race:'elf',updatedAt:'2025-01-02T00:00:00Z',levelsText:'',classEntries:[],abilityScores:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},inventoryItems:[],spellSelections:[],featuresAndFeats:[]}
  ];
  
  await page.evaluate(d => {
    localStorage.setItem('arcanum.characterDrafts', JSON.stringify(d));
  }, data);
  console.log('[B] Seeded');
  
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  console.log('[C] Reloaded');
  
  await page.waitForTimeout(4000);
  
  const articles = await page.$$('article');
  console.log('[D] Found', articles.length, 'articles');
  
  if (articles.length > 0) {
    for (const art of articles) {
      const txt = await art.innerText();
      console.log('  ->', txt.substring(0,40));
    }
  }
  
  await page.screenshot({path:'/Users/max/dev/Arcanum/.qa/debug.png'});
  
  // Direct ls check
  const checkRaw = await page.evaluate(() => localStorage.getItem('arcanum.characterDrafts'));
  console.log('[E] LS raw exists:', !!checkRaw);
  if (checkRaw) {
    const parsed = JSON.parse(checkRaw);
    console.log('[E] LS parsed has', parsed.length, 'items');
    console.log('[E] Names:', parsed.map(p => p.name));
  }

  await browser.close();
} catch(e) {
  console.error('[ERR]', e.message);
  await browser.close();
}