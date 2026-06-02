import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleLog = [];
page.on('console', msg => consoleLog.push(msg.text()));

try {
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // 3 drafts: 2 valid, 1 with NO id
  const testData = [
    {id:'v1',name:'Grog',race:'orc',updatedAt:'2025-01-01T00:00:00Z',levelsText:'',classEntries:[],abilityScores:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},inventoryItems:[],spellSelections:[],featuresAndFeats:[]},
    {name:'BadNoId',race:'goblin',updatedAt:'bad',levelsText:'',classEntries:[],abilityScores:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},inventoryItems:[],spellSelections:[],featuresAndFeats:[]},
    {id:'v2',name:'Mira',race:'human',updatedAt:'2025-01-02T00:00:00Z',levelsText:'',classEntries:[],abilityScores:{STR:10,DEX:10,CON:10,INT:10,WIS:10,CHA:10},inventoryItems:[],spellSelections:[],featuresAndFeats:[]}
  ];

  await page.evaluate(d => localStorage.setItem('arcanum.characterDrafts', JSON.stringify(d)), testData);

  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  const visible = await page.evaluate(() => {
    const arts = document.querySelectorAll('article');
    return Array.from(arts).map(a => a.innerText.split('\n')[0].trim());
  });

  console.log('Visible:', visible);
  
  const storageLogs = consoleLog.filter(m => m.includes('[storage]'));
  console.log('\nStorage logs:');
  storageLogs.forEach(l => console.log(' ', l));

} catch(e) {
  console.error(e.message);
} finally {
  await browser.close();
}