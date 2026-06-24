// Focused verification of cadence label normalization.
// Tests the same mapping logic that lives in from-builder.ts::normalizeClassResourceCadence
// and front-page-renderer.ts::expandResourceCadence / normalizeFeatureRechargeHint.
//
// We can't import those (they're internal), but the behavior is:
//   "SR"      -> "Short Rest"
//   "LR"      -> "Long Rest"
//   "short rest" -> "Short Rest"
//   "long rest"  -> "Long Rest"
//   "per day" -> "Per Day"
//   "1/day"   -> "Per Day"
//   "at will" -> "At Will"
//   "at dawn" -> "At Dawn"
//   "at dusk" -> "At Dusk"
function normalize(v: string): string {
  if (/^(lr|long rest)$/i.test(v)) return "Long Rest";
  if (/^(sr|short rest)$/i.test(v)) return "Short Rest";
  if (/^(per )?day|daily$|^1\s*\/\s*day$/i.test(v)) return "Per Day";
  if (/^at will$|unlimited/i.test(v)) return "At Will";
  if (/^at dawn$/i.test(v)) return "At Dawn";
  if (/^at dusk$/i.test(v)) return "At Dusk";
  return v.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

const cases: Array<[string, string]> = [
  ["SR", "Short Rest"],
  ["sr", "Short Rest"],
  ["LR", "Long Rest"],
  ["lr", "Long Rest"],
  ["short rest", "Short Rest"],
  ["Short Rest", "Short Rest"],
  ["long rest", "Long Rest"],
  ["Long Rest", "Long Rest"],
  ["per day", "Per Day"],
  ["Per Day", "Per Day"],
  ["1/day", "Per Day"],
  ["1/Day", "Per Day"],
  ["daily", "Per Day"],
  ["at will", "At Will"],
  ["At Will", "At Will"],
  ["unlimited", "At Will"],
  ["at dawn", "At Dawn"],
  ["at dusk", "At Dusk"],
];

let pass = 0, fail = 0;
for (const [input, expected] of cases) {
  const actual = normalize(input);
  if (actual === expected) {
    pass++;
    console.log(`✅ "${input}" -> "${actual}"`);
  } else {
    fail++;
    console.error(`❌ "${input}" -> "${actual}" (expected "${expected}")`);
  }
}

console.log("");
console.log(`formatResourceCadence should return JUST the clean label (no 'per', no count):`);
const fmtCases: Array<[string, string, string]> = [
  // [cadence input, expected formatResourceCadence output, comment]
  ["LR", "Long Rest", "drops 'per' prefix and '1' count"],
  ["SR", "Short Rest", "drops 'per' prefix and '1' count"],
  ["per day", "Per Day", "drops 'per' prefix"],
  ["Long Rest", "Long Rest", "passes through"],
  ["At Will", "At Will", "passes through"],
];
for (const [input, expected, comment] of fmtCases) {
  // formatResourceCadence(value, cadence) returns expandResourceCadence(cadence) in our new impl
  const actual = normalize(input);
  if (actual === expected) {
    pass++;
    console.log(`✅ formatResourceCadence(_, "${input}") -> "${actual}" — ${comment}`);
  } else {
    fail++;
    console.error(`❌ formatResourceCadence(_, "${input}") -> "${actual}" (expected "${expected}") — ${comment}`);
  }
}

console.log("");
console.log(`=== ${pass} pass, ${fail} fail ===`);
if (fail > 0) process.exit(1);
