import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  // Clear any cookies/storage first
  await page.context().clearCookies();
  
  // Load characters page - fresh
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  console.log('[LOADED] /characters');
  
  // Get initial state
  const initialCookies = await page.context().cookies();
  console.log('[COOKIES]', JSON.stringify(initialCookies.map(c => c.name)));
  
  // Print page content
  const html = await page.content();
  console.log('[HTML LEN]', html.length);
  console.log('[HTML SNIPPET]', html.substring(html.indexOf('<body'), html.indexOf('<body') + 500));

  // Seed
  const testData = [
    {id:'t1',name:'Alpha',race:'human',updatedAt:'2025-01-01T00:00:00Z',levelsText:'',classEntries:[],abilityScores:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},inventoryItems:[],spellSelections:[],featuresAndFeats:[]},
    {id:'t2',name:'Beta',race:'elf',updatedAt:'2025-01-02T00:00:00Z',levelsText:'',classEntries:[],abilityScores:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},inventoryItems:[],spellSelections:[],featuresAndFeats:[]}
  ];
  await page.evaluate(d => localStorage.setItem('arcanum.characterDrafts', JSON.stringify(d)), testData);
  console.log('[SEEDED] 2 drafts');

  // Reload
  await page.reload({waitUntil: 'networkidle'});
  await page.waitForTimeout(2000);

  const result = await page.evaluate(() => {
    const articles = document.querySelectorAll('article');
    return Array.from(articles).map(a => a.innerText.substring(0,30));
  });
  
  console.log('[ARTICLES]', result);
  console.log('[COUNT]', result.length);
  
  await page.screenshot({path:'/Users/max/dev/Arcanum/.qa/test-check.png', fullPage:true});
  
} catch(e) {
  console.error('[E]', e.message);
} finally {
  await browser.close();
}