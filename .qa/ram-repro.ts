/**
 * RAM Repro script for /characters 15GB spike
 * Usage: node --require ts-node/register qa/ram-repro.ts
 */

import { chromium, Page } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';

const QA_DIR = '/Users/max/dev/Arcanum/.qa';
const DEV_URL = 'http://localhost:3000/characters';

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// 2 valid drafts + 1 corrupt row (non-string updatedAt)
function buildCorruptedDrafts() {
  const validDrafts = [
    {
      id: 'draft-001',
      name: 'Thorin Ironfoot',
      class: 'Fighter',
      level: 5,
      race: 'Dwarf',
      abilityScores: { STR: 16, DEX: 12, CON: 16, INT: 8, WIS: 10, CHA: 9 },
      hp: { current: 42, max: 44 },
      ac: 18,
      skills: [],
      equipment: ['Longsword', 'Shield', 'Scale mail'],
      spells: [],
      notes: 'Stubborn dwarf warrior from the Blue Mountains',
      createdAt: '2024-01-15T10:30:00.000Z',
      updatedAt: '2024-03-01T14:22:00.000Z',
      version: 1,
      metadata: { source: 'manual', campaign: 'Easterling Wars' },
    },
    {
      id: 'draft-002',
      name: 'Elara Moonwhisper',
      class: 'Wizard',
      level: 3,
      race: 'High Elf',
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 13, CHA: 11 },
      hp: { current: 14, max: 16 },
      ac: 12,
      skills: ['Arcana', 'History', 'Investigation'],
      equipment: ['Quarterstaff', 'Spellbook', 'Component pouch'],
      spells: ['Magic Missile', 'Shield', 'Mage Armor', 'Detect Magic'],
      notes: 'Scholar of the high arts, specializes in divination',
      createdAt: '2024-02-20T09:00:00.000Z',
      updatedAt: '2024-03-10T11:05:00.000Z',
      version: 1,
      metadata: { source: 'manual', campaign: 'Easterling Wars' },
    },
  ];

  const corruptDraft = {
    id: 'draft-003',
    name: 'Grimjaw the Bold',
    class: 'Barbarian',
    level: 7,
    race: 'Half-Orc',
    abilityScores: { STR: 18, DEX: 13, CON: 16, INT: 7, WIS: 11, CHA: 8 },
    hp: { current: 68, max: 71 },
    ac: 15,
    skills: ['Intimidation', 'Survival'],
    equipment: ['Greataxe', 'Javelin', 'Hide armor'],
    spells: [],
    notes: 'Tribe champion from the eastern wastes',
    createdAt: '2024-01-20T08:00:00.000Z',
    updatedAt: 12345, // corrupt: number, not string
    version: 1,
    metadata: { source: 'manual' },
  };

  return { drafts: [validDrafts[0], validDrafts[1], corruptDraft] };
}

async function getMemorySample(page: Page): Promise<{
  jsHeap: number;
  jsHeapTotal: number;
  jsHeapLimit: number;
  systemMem: number;
}> {
  return await page.evaluate(() => {
    const perf = performance as any;
    const mem = perf.memory ? perf.memory : null;
    return {
      jsHeap: mem ? mem.usedJSHeapSize : -1,
      jsHeapTotal: mem ? mem.totalJSHeapSize : -1,
      jsHeapLimit: mem ? mem.jsHeapSizeLimit : -1,
      systemMem: -1,
    };
  });
}

async function takeHeapSnapshot(page: Page, label: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const snapshot = await cdp.send('HeapProfiler.takeHeapSnapshot', {}) as any;
    const snapshotData = JSON.stringify(snapshot);
    const filePath = path.join(QA_DIR, `heap-${label}-${getTimestamp()}.heapsnapshot`);
    fs.writeFileSync(filePath, snapshotData);
    console.log(`  [Snapshot] Saved ${filePath} (${(snapshotData.length / 1024 / 1024).toFixed(2)} MB)`);
  } catch (e) {
    console.log(`  [Snapshot] Failed for ${label}: ${e}`);
  } finally {
    await cdp.detach();
  }
}

async function getRetainers(page: Page): Promise<string> {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.startSampling', {});
    await new Promise(r => setTimeout(r, 2000));
    const profile = await cdp.send('HeapProfiler.stopSampling', {}) as any;
    await cdp.detach();
    return JSON.stringify(profile);
  } catch (e) {
    return `Retainer check failed: ${e}`;
  }
}

async function main() {
  console.log('=== RAM Repro v2 ===');
  console.log(`Timestamp: ${getTimestamp()}`);
  console.log(`Target: ${DEV_URL}`);
  console.log('');

  // Check dev server
  const checkResponse = await fetch(DEV_URL);
  console.log(`Dev server status: ${checkResponse.status}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-precise-memory-info',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    storageState: undefined,
  });

  const page = await context.newPage();

  // Collect all console messages
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Seed localStorage BEFORE first navigation
  console.log('=== Seeding localStorage ===');
  const corruptedPayload = buildCorruptedDrafts();
  await page.goto('about:blank');
  await page.evaluate((payload) => {
    localStorage.setItem('arcanum.characterDrafts', JSON.stringify(payload));
  }, corruptedPayload);
  console.log(`Seeded ${corruptedPayload.drafts.length} drafts (last one has corrupt updatedAt)`);
  console.log('');

  // === PHASE 1: Initial load ===
  console.log('=== PHASE 1: Initial Load ===');
  const mem1 = await getMemorySample(page);
  console.log(`Memory before navigation: heap=${(mem1.jsHeap / 1024 / 1024).toFixed(2)} MB`);

  await page.goto(DEV_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(10000); // wait 10s for any delayed effects

  const mem2 = await getMemorySample(page);
  const console1 = consoleLogs.slice();
  console.log(`Memory after 10s: heap=${(mem2.jsHeap / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Delta: ${((mem2.jsHeap - mem1.jsHeap) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Console messages: ${console1.length}`);

  await takeHeapSnapshot(page, 'phase1-after-load');

  // Screenshot
  const screenshot1Path = path.join(QA_DIR, `characters-state-phase1-${getTimestamp()}.png`);
  await page.screenshot({ path: screenshot1Path });
  console.log(`Screenshot: ${screenshot1Path}`);

  // Check page content
  const draftCount = await page.evaluate(() => {
    // Look for draft rows
    const rows = document.querySelectorAll('[data-testid*="draft"], .draft, [class*="draft"]');
    return rows.length;
  });
  console.log(`Visible draft elements: ${draftCount}`);

  const pageErrors = consoleLogs.filter(l => l.includes('[error]') || l.includes('Error'));
  if (pageErrors.length > 0) {
    console.log(`Page errors: ${pageErrors.join(', ')}`);
  }

  console.log('');

  // === PHASE 2: Reload ===
  console.log('=== PHASE 2: Reload ===');
  const mem3 = await getMemorySample(page);
  console.log(`Memory before reload: heap=${(mem3.jsHeap / 1024 / 1024).toFixed(2)} MB`);

  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(10000); // wait 10s after reload

  const mem4 = await getMemorySample(page);
  const console2 = consoleLogs.slice();
  console.log(`Memory after reload 10s: heap=${(mem4.jsHeap / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Delta from phase1: ${((mem4.jsHeap - mem2.jsHeap) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Delta from pre-reload: ${((mem4.jsHeap - mem3.jsHeap) / 1024 / 1024).toFixed(2)} MB`);

  await takeHeapSnapshot(page, 'phase2-after-reload');

  const screenshot2Path = path.join(QA_DIR, `characters-state-phase2-${getTimestamp()}.png`);
  await page.screenshot({ path: screenshot2Path });
  console.log(`Screenshot: ${screenshot2Path}`);

  console.log('');

  // === SUMMARY ===
  console.log('=== SUMMARY ===');
  console.log(`Initial → After Load: ${((mem2.jsHeap - mem1.jsHeap) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`After Load → After Reload: ${((mem4.jsHeap - mem2.jsHeap) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total growth: ${((mem4.jsHeap - mem1.jsHeap) / 1024 / 1024).toFixed(2)} MB`);

  // Check if we see the 15GB spike
  if (mem4.jsHeap > 10 * 1024 * 1024 * 1024) {
    console.log('\n⚠️  SEVERE: Memory exceeds 10GB — spike confirmed!');
  } else if (mem4.jsHeap > 500 * 1024 * 1024) {
    console.log(`\n⚠️  WARNING: Memory at ${(mem4.jsHeap / 1024 / 1024).toFixed(0)} MB — elevated but not 15GB');
  } else {
    console.log('\n✓ Memory appears stable');
  }

  // Save full console log
  const logPath = path.join(QA_DIR, `console-log-${getTimestamp()}.txt`);
  fs.writeFileSync(logPath, consoleLogs.join('\n'));
  console.log(`Console log: ${logPath}`);

  await browser.close();
  console.log('\nDone.');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});