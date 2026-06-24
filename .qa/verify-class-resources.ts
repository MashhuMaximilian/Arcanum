// Verify the data path: buildPdfCharacterFromBuilder should produce
// class-resource stats with the right cadence in the meta string.
import { buildPdfCharacterFromBuilder } from "../web/lib/pdf/from-builder.ts";

const args = {
  classRecordsByEntry: [
    { record: { id: "ID_WOTC_PHB_CLASS_WIZARD", name: "Wizard", rules: [
      { kind: "grant", type: "Class Feature", id: "ID_WOTC_PHB_CLASS_FEATURE_WIZARD_ARCANE_RECOVERY", level: 1 },
    ], features: [
      { id: "ID_WOTC_PHB_CLASS_FEATURE_WIZARD_ARCANE_RECOVERY", type: "Class Feature", name: "Arcane Recovery" },
    ] }, entry: { id: "w1", classId: "ID_WOTC_PHB_CLASS_WIZARD", level: 1, subclassId: null } },
  ],
  selectedClassFeatureElements: [
    { id: "ID_WOTC_PHB_CLASS_FEATURE_WIZARD_ARCANE_RECOVERY", type: "Class Feature", name: "Arcane Recovery" },
  ],
  // minimal placeholder fields (filled in below)
  identity: { name: "Test", player: "T", alignment: "TN", classes: [], totalLevel: 1, race: { id: "r1", name: "Human" }, background: { id: "b1", name: "Sage" } },
} as any;

const result = buildPdfCharacterFromBuilder(args);
const classResourceStats = result.frontPage.stats.filter((s: any) => s.id.startsWith("class-resource-"));
console.log(`Generated ${classResourceStats.length} class-resource stats:`);
for (const s of classResourceStats) {
  console.log(`  id=${s.id} label=${s.label} value=${s.value} meta=${JSON.stringify(s.meta)}`);
}
