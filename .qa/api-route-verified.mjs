#!/usr/bin/env node
/**
 * QA Verification: SRD Catalog API Route
 * Run after refactoring SRD catalogs from RSC props to /api/srd-catalogs
 */

const BASE_URL = "http://localhost:3000";

async function fetchWithTiming(url) {
  const start = Date.now();
  const response = await fetch(url);
  const elapsed = Date.now() - start;
  const size = parseInt(response.headers.get("content-length") || "0", 10);
  return {
    status: response.status,
    size,
    sizeMB: (size / (1024 * 1024)).toFixed(2),
    elapsed,
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("SRD Catalog API Route — QA Verification");
  console.log("=".repeat(60));
  console.log();

  // Test /api/srd-catalogs
  console.log("1. /api/srd-catalogs");
  console.log("-".repeat(40));
  const apiStart = Date.now();
  const apiResponse = await fetch(`${BASE_URL}/api/srd-catalogs`);
  const apiData = await apiResponse.json();
  const apiElapsed = Date.now() - apiStart;
  const apiSize = JSON.stringify(apiData).length;
  console.log(`   HTTP Status: ${apiResponse.status}`);
  console.log(`   Response Size: ${(apiSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   Fields: ${Object.keys(apiData).join(", ")}`);
  console.log(`   backgrounds: ${apiData.backgrounds?.length ?? 0}`);
  console.log(`   classes: ${apiData.classes?.length ?? 0}`);
  console.log(`   feats: ${apiData.feats?.length ?? 0}`);
  console.log(`   progressionElements: ${apiData.progressionElements?.length ?? 0}`);
  console.log(`   races: ${apiData.races?.length ?? 0}`);
  console.log(`   spells: ${apiData.spells?.length ?? 0}`);
  console.log(`   Response Time: ${apiElapsed}ms`);
  console.log();

  // Test /builder/new
  console.log("2. /builder/new");
  console.log("-".repeat(40));
  const newResponse = await fetch(`${BASE_URL}/builder/new`, {
    redirect: "manual",
  });
  console.log(`   HTTP Status: ${newResponse.status} (${newResponse.status === 307 ? "redirect to /signin (expected)" : newResponse.status === 200 ? "ok" : "other"})`);
  // For RSC payload, we need the actual response body
  const newFull = await fetch(`${BASE_URL}/builder/new`);
  const newText = await newFull.text();
  console.log(`   RSC Payload Size: ${(newText.length / 1024).toFixed(2)} KB`);
  console.log();

  // Test /builder/[id]
  console.log("3. /builder/[id] (test-id)");
  console.log("-".repeat(40));
  const idResponse = await fetch(`${BASE_URL}/builder/test-id`, {
    redirect: "manual",
  });
  console.log(`   HTTP Status: ${idResponse.status}`);
  const idFull = await fetch(`${BASE_URL}/builder/test-id`);
  const idText = await idFull.text();
  console.log(`   RSC Payload Size: ${(idText.length / 1024).toFixed(2)} KB`);
  console.log();

  // Summary
  console.log("=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`API Route: ${apiResponse.status === 200 ? "✓ OK" : "✗ FAIL"}`);
  console.log(`API Response Size: ${(apiSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Builder New Page: ${newResponse.status >= 200 && newResponse.status < 400 ? "✓ OK" : "✗ FAIL"} (RSC: ${(newText.length / 1024).toFixed(2)} KB)`);
  console.log(`Builder Detail Page: ${idResponse.status >= 200 && idResponse.status < 400 ? "✓ OK" : "✗ FAIL"} (RSC: ${(idText.length / 1024).toFixed(2)} KB)`);
  console.log();
  console.log("Note: RSC payload size BEFORE refactor was larger because SRD data");
  console.log("was embedded in the server-rendered HTML. Now data is fetched");
  console.log("client-side from /api/srd-catalogs, reducing initial page payload.");
}

main().catch(console.error);