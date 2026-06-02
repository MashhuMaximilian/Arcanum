import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle' });
  
  // Now manually evaluate the storage code in page context
  const storageDebug = await page.evaluate(() => {
    const KEY = 'arcanum.characterDrafts';
    const raw = localStorage.getItem(KEY);
    if (!raw) return { step: 'no_key', raw: null };
    
    // Parse manually like listCharacterDrafts does
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch(e) {
      return { step: 'parse_error', error: e.message, raw: raw.substring(0, 100) };
    }
    
    if (!Array.isArray(parsed)) {
      return { step: 'not_array', type: typeof parsed };
    }
    
    // Try normalizing each like the fix does
    const normalized = [];
    for (let i = 0; i < parsed.length; i++) {
      const draft = parsed[i];
      try {
        // Just check if has required fields (id must be string)
        if (typeof draft.id !== 'string') {
          normalized.push({ ok: false, reason: 'no_id', draft: draft.name || 'unnamed' });
          continue;
        }
        if (typeof draft.updatedAt !== 'string') {
          normalized.push({ ok: false, reason: 'non_string_updatedAt', updatedAt: typeof draft.updatedAt, draft: draft.name });
          continue;
        }
        normalized.push({ ok: true, name: draft.name, id: draft.id, updatedAt: draft.updatedAt });
      } catch(e) {
        normalized.push({ ok: false, reason: 'normalize_error', error: e.message });
      }
    }
    
    return { 
      step: 'analyzed',
      total: parsed.length,
      validCount: normalized.filter(n => n.ok).length,
      results: normalized 
    };
  });

  console.log('[STORAGE DEBUG]', JSON.stringify(storageDebug, null, 2));

  // Check localStorage via DevTools protocol
  const lsKeys = await page.evaluate(() => Object.keys(localStorage));
  console.log('[LS KEYS]', lsKeys);

  await page.screenshot({ path: '/Users/max/dev/Arcanum/.qa/test-storage-debug.png', fullPage: true });

} catch (err) {
  console.error('[ERROR]', err.message);
} finally {
  await browser.close();
}