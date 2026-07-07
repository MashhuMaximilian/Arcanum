// Build a Rangies ResolvedPdfCharacter and POST to /pdf-export so we can
// reproduce exactly what the user sees in the browser. Mirrors the schema
// of .qa/build-artific-pdf.mjs but uses the actual Rangies values from
// /Users/max/Downloads/rangies-arcanum-build (1).json.

import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

// Wood Elf lvl 3 Beast Master Ranger, Hermit, Chaotic good, Tymora.
// Base abilities (before racial ASI):
//   STR 14  DEX 10  CON 9  INT 10  WIS 11  CHA 9
// Wood Elf: +2 DEX, +1 WIS
// Effective: STR 14  DEX 12  CON 9  INT 10  WIS 12  CHA 9
//   mods:  +2     +1     -1    +0     +1     -1
// Save proficient (Ranger + Hermit): DEX, WIS, INT? Actually Ranger
// lvl 1 gives 2 saves from a list. Hermit gives Revelation (no save).
// Looking at the rendered PDF: STR -1, DEX +3, CON -1, INT +0, WIS +3, CHA -1
// → proficient: DEX, WIS only. (INT is not prof at lvl 3 here.)

const character = {
  id: "qa-rangies",
  name: "Rangies",
  playerName: "Max",
  level: 3,
  raceLabel: "Elf",
  subraceLabel: "Wood Elf",
  classLabel: "Ranger 3",
  subclassLabel: "Beast Master",
  backgroundLabel: "Hermit",
  alignment: "Chaotic good",
  deity: "Tymora",
  stats: [],
  frontPage: {
    stats: [
      { id: "prof-bonus", label: "Proficiency Bonus", value: "+2" },
      { id: "initiative", label: "Initiative", value: "+1" },
      { id: "attacks", label: "Attacks Per Action", value: "2" },
      { id: "inspiration", label: "Inspiration", value: "" },
      { id: "exhaustion", label: "Exhaustion Lvl", value: "" },
      { id: "max-hp", label: "Max HP", value: "30" },
      { id: "hp", label: "HP", value: "" },
      { id: "temp-hp", label: "Temp. HP", value: "" },
      { id: "hit-dice", label: "Hit Dice", value: "3d10" },
      { id: "defenses", label: "Defenses", value: "" },
      { id: "spellcasting-source-ranger-bonus", label: "Ranger Bonus", value: "+3" },
      { id: "spellcasting-source-ranger-dc", label: "Ranger DC", value: "11" },
      { id: "spellcasting-source-ranger-ability", label: "Ranger Ability", value: "WIS" },
    ],
    abilityRows: [
      { id: "str", label: "STR", score: 14, modifier: 2, saveBonus: -1, saveProficient: false },
      { id: "dex", label: "DEX", score: 12, modifier: 1, saveBonus: 3, saveProficient: true },
      { id: "con", label: "CON", score: 9, modifier: -1, saveBonus: -1, saveProficient: false },
      { id: "int", label: "INT", score: 10, modifier: 0, saveBonus: 0, saveProficient: false },
      { id: "wis", label: "WIS", score: 12, modifier: 1, saveBonus: 3, saveProficient: true },
      { id: "cha", label: "CHA", score: 9, modifier: -1, saveBonus: -1, saveProficient: false },
    ],
    skillRows: [
      { id: "athletics", label: "Athletics", ability: "STR", proficient: false, expertise: false, total: 2 },
      { id: "acrobatics", label: "Acrobatics", ability: "DEX", proficient: false, expertise: false, total: 1 },
      { id: "sleight", label: "Sleight of Hand", ability: "DEX", proficient: false, expertise: false, total: 1 },
      { id: "stealth", label: "Stealth", ability: "DEX", proficient: false, expertise: false, total: 1 },
      { id: "arcana", label: "Arcana", ability: "INT", proficient: false, expertise: false, total: 0 },
      { id: "history", label: "History", ability: "INT", proficient: false, expertise: false, total: 0 },
      { id: "investigation", label: "Investigation", ability: "INT", proficient: false, expertise: false, total: 0 },
      { id: "nature", label: "Nature", ability: "INT", proficient: true, expertise: false, total: 2 },
      { id: "religion", label: "Religion", ability: "INT", proficient: true, expertise: false, total: 2 },
      { id: "ah", label: "Animal Handling", ability: "WIS", proficient: false, expertise: false, total: 1 },
      { id: "insight", label: "Insight", ability: "WIS", proficient: false, expertise: false, total: 1 },
      { id: "medicine", label: "Medicine", ability: "WIS", proficient: false, expertise: false, total: 1 },
      { id: "perception", label: "Perception", ability: "WIS", proficient: true, expertise: false, total: 3 },
      { id: "survival", label: "Survival", ability: "WIS", proficient: false, expertise: false, total: 1 },
      { id: "deception", label: "Deception", ability: "CHA", proficient: false, expertise: false, total: -1 },
      { id: "intimidation", label: "Intimidation", ability: "CHA", proficient: false, expertise: false, total: -1 },
      { id: "performance", label: "Performance", ability: "CHA", proficient: false, expertise: false, total: -1 },
      { id: "persuasion", label: "Persuasion", ability: "CHA", proficient: false, expertise: false, total: -1 },
    ],
    attackRows: [
      { id: "oathbow", name: "Oathbow", hit: "+4", damage: "1d8+2", damageType: "piercing", properties: "amm, heavy, two-handed" },
    ],
    proficiencyGroups: {
      weapons: ["Longsword, Shortsword, Shortbow, Longbow"],
      armor: ["Light Armor, Medium Armor, Shields"],
      tools: ["Herbalism Kit, Set Of Common Clothes"],
      vehicles: [""],
      languages: ["Common, Elvish, Thieves Cant"],
    },
    deck: [
      {
        id: "primeval-awareness",
        title: "Primeval Awareness",
        kind: "class",
        contentKind: "feature",
        summary: "Beginning at 3rd level, you can use your **action** and expend one ranger spell slot to focus your awareness on the region around you.",
        detail: "",
        sourceLabel: "Class 2",
        sourceAction: "Action",
        tags: [],
        priority: 0,
      },
    ],
    deckOverflow: [],
    railCards: [],
    rightColumn: {
      sensesAndConditions: [],
      racialCards: [
        { id: "elven-subrace", title: "Elven Subrace", kind: "racial", contentKind: "feature", summary: "", detail: "", tags: [], priority: 0 },
        { id: "fey-ancestry", title: "Fey Ancestry", kind: "racial", contentKind: "feature", summary: "Advantage on saving throws against being charmed, and magic can't put you to sleep.", detail: "Advantage on saving throws against being charmed, and magic can't put you to sleep.", tags: [], priority: 0 },
        { id: "keen-senses", title: "Keen Senses", kind: "racial", contentKind: "feature", summary: "", detail: "", tags: [], priority: 0 },
        { id: "trance", title: "Trance", kind: "racial", contentKind: "feature", summary: "Elves don't need to sleep. Instead, they meditate deeply, remaining semiconscious, for 4 hours a day.", detail: "Elves don't need to sleep. Instead, they meditate deeply, remaining semiconscious, for 4 hours a day.", tags: [], priority: 0 },
      ],
      subracialCards: [
        { id: "elf-weapon-training", title: "Elf Weapon Training", kind: "subracial", contentKind: "feature", summary: "", detail: "", tags: [], priority: 0 },
        { id: "fleet-of-foot", title: "Fleet of Foot", kind: "subracial", contentKind: "feature", summary: "", detail: "", tags: [], priority: 0 },
        { id: "mask-of-the-wild", title: "Mask of the Wild", kind: "subracial", contentKind: "feature", summary: "You can attempt to hide even when you are only lightly obscured.", detail: "You can attempt to hide even when you are only lightly obscured.", tags: [], priority: 0 },
      ],
      feats: [],
      conditions: [],
      senses: [],
      notes: [],
    },
    notes: [],
    capacity: 0,
    combatHub: { weaponRows: [], hasSpells: true },
  },
  companionCards: [],
  inventoryCards: [
    {
      id: "oathbow",
      kind: "item",
      title: "Oathbow",
      includeInItemDescriptions: true,
      rarity: "Very Rare",
      itemType: "Magic Weapon",
      weight: "",
      attunable: true,
      attuned: true,
      detailHtml: "<p><strong>Oathbow (Very Rare Magic Weapon, Attunement Required)</strong></p><p>When you nock an arrow on this bow, it whispers in Elvish, \"Swift defeat to my enemies.\" When you use this weapon to make a ranged **attack**, you can, as a command phrase, say, \"Swift death to you who has wronged me.\" The target of your **attack** becomes your sworn enemy until it dies or until dawn seven days later.</p><p>While your sworn enemy lives, you have advantage on **attack** rolls with this weapon against your sworn enemy. In addition, your target gains no benefit from cover, other than total cover, and you suffer no disadvantage due to long range. If the **attack** hits, your sworn enemy takes an extra 3d6 piercing damage.</p><p>While your sworn enemy lives, you have disadvantage on **attack** rolls with all other weapons.</p>",
    },
    {
      id: "cube-of-force",
      kind: "item",
      title: "Cube of Force",
      includeInItemDescriptions: true,
      rarity: "Rare",
      itemType: "Wondrous Item",
      weight: "",
      attunable: false,
      attuned: false,
      detailHtml: "<p><strong>Cube of Force (Rare Magic Item)</strong></p><p>This cube is about an inch across. Each face has a distinct marking on it that can be pressed. The cube starts with 36 charges, and it regains 1d20 expended charges daily at dawn.</p><p>You can use an **action** to press one of the cube's faces, expending a number of charges based on the chosen face.</p>",
    },
    {
      id: "prayer-beads",
      kind: "item",
      title: "Prayer Beads",
      includeInItemDescriptions: true,
      rarity: "",
      itemType: "Wondrous Item",
      weight: "",
      attunable: true,
      attuned: true,
      detailHtml: "<p><strong>Prayer Beads (Signature Item)</strong></p><p><strong>Bead Count:</strong> 25 beads. <strong>Usage:</strong> Each bead can be used once per long rest.</p><p><strong>Activation:</strong> Requires a **bonus action** to use a bead.</p><p>**Praying Mantis Style** **Swiftness** **Effect:** As part of that **action** you make, you can also **move** up to 15 ft. towards a target without provoking opportunity **attacks**.</p><p><strong>Saving Face:</strong> When you fail a Charisma (Deception) check, you can use your reaction to reroll the check with a bonus equal to your Wisdom modifier.</p><p><strong>Iron Feet</strong> = 2x Successful **Unarmed Strike** (Fist). <strong>Earth Strikes</strong> Strike (fist) = You may make one additional **attack** striking with both fists.</p><p><strong>Iron Clad Style</strong> = 2x Successful **Unarmed Strike** (Fist) iron feet = YOU gain +4 bonus to AC.</p><p><strong>Snake Style</strong> = 2x Successful **Unarmed Strike** (Fist) <strong>Lightning Strike</strong> = enemies hit by your **unarmed strikes** must make a CON saving throw (Ki DC); they take 1d6 lightning damage on a fail and are stunned until the next round.</p><p><strong>Lightning Style</strong> = As a **bonus action**, make 1 **attack** (**Unarmed**) at the end; you make 1 **attack**; enemies within 15 ft of targeted enemy must make a CON save or take 1d6 damage.</p><p><strong>Snake's Reflexes</strong> = you may take the Disengage **action** this turn; grants +10 ft of **movement** for this turn.</p><p><strong>Seven-sided strike</strong> = Part of the **bonus action**, you may quickly **attack** up to 3 enemies within a 20 ft radius (only 1 **attack**); you take the **Attack action** and make one additional **attack**.</p>",
    },
  ],
  spellCards: [
    {
      id: "level-1",
      kind: "spell-list",
      title: "Spell List",
      level: 1,
      spells: [
        { name: "Alarm", level: 1 },
        { name: "Cure Wounds", level: 1 },
        { name: "Goodberry", level: 1 },
      ],
      pactSummary: "",
    },
  ],
  backstoryCards: [],
  appendixEntries: [],
  notes: [],
  pagePlan: [],
  railCards: [],
  source: {
    id: "qa-rangies",
    name: "Rangies",
    classEntries: [],
    level: 3,
    abilities: { str: 14, dex: 12, con: 9, int: 10, wis: 12, cha: 9 },
    skillProficiencies: [],
    saveProficiencies: [],
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: [],
    inventoryItems: [
      {
        id: "oathbow",
        name: "Oathbow",
        quantity: 1,
        weight: "1 lb.",
        equipped: true,
        attuned: true,
        attunable: true,
        rarity: "Very Rare",
        itemType: "Magic Weapon",
        category: "weapon",
        includeInItemDescriptions: true,
        sheetDescription: "When you nock an arrow on this bow, it whispers in Elvish, \"Swift defeat to my enemies.\" When you use this weapon to make a ranged attack, you can, as a command phrase, say, \"Swift death to you who has wronged me.\" The target of your attack becomes your sworn enemy until it dies or until dawn seven days later. You can have only one such sworn enemy at a time. When your sworn enemy dies, you can choose a new one after the next dawn. While your sworn enemy lives, you have advantage on attack rolls with this weapon against your sworn enemy. If the attack hits, your sworn enemy takes an extra 3d6 piercing damage. While your sworn enemy lives, you have disadvantage on attack rolls with all other weapons.",
      },
      {
        id: "cube-of-force",
        name: "Cube of Force",
        quantity: 1,
        weight: "0 lb.",
        equipped: false,
        attuned: false,
        attunable: false,
        rarity: "Rare",
        itemType: "Wondrous Item",
        category: "wondrous",
        includeInItemDescriptions: true,
        sheetDescription: "This cube is about an inch across. Each face contains a different magical effect. The cube starts with 36 charges, and it regains 1d20 expended charges daily at dawn. You can use an action to press one of the cube's faces, expending a number of charges based on the chosen face, as shown in the Cube of Force Faces table. If you press a face with insufficient charges remaining, nothing happens. Otherwise, a barrier of invisible force springs into existence, forming a cube 15 feet on a side. The barrier is centered on you, moves with you, and lasts for 1 minute, until you use an action to press the cube's sixth face, or the cube runs out of charges. If your movement causes the barrier to come into contact with a solid object that can't pass through the cube, you can't move any closer to that object as long as the barrier remains. The cube loses charges when the barrier is targeted by certain spells or magic item effects, as shown in the table below. Some spells and abilities may bypass the cube entirely and target you directly. The barrier doesn't move with a creature you summon, only with you. You can also use the cube to extend your defense by moving it strategically.",
      },
      {
        id: "prayer-beads",
        name: "Prayer Beads",
        quantity: 1,
        weight: "0 lb.",
        equipped: false,
        attuned: true,
        attunable: true,
        rarity: "Wondrous",
        itemType: "Wondrous Item",
        category: "wondrous",
        includeInItemDescriptions: true,
        sheetDescription: "Wondrous item (requires attunement). These beads consist of 25 prayer beads strung on a thin silver chain. As a bonus action, you can use the beads to cast a spell you know from a list of 25 spells (GM's choice), targeting yourself. You can use each bead once per long rest. Each bead is unique: Praying Mantis Style grants +4 to your attack rolls and movement; Iron Feet gives you +4 to AC and advantage on Strength and Constitution saving throws; Steelfist grants +3 to hit and a d10 to unarmed strikes vs armored enemies. Each bead can also be cast once per long rest to gain advantage on Strength checks, advantage on Constitution saving throws, or a bonus to movement, attack rolls, AC, or unarmed strike damage. Most of these effects last 1 minute and allow you to combine them with multiattack and bonus action economy. The beads lose their magic if you lose attunement to them, so you should re-attune at the next long rest. Some beads grant additional reactive benefits when you take damage from specific sources. The full list and effects are described below. You cannot use more than one bead of the same kind in a single turn; combining requires you to spend an additional bonus action to activate the second bead. If a bead requires an attack roll, you use your unarmed strike attack bonus. Some beads require a saving throw from the target; the DC equals 8 plus your proficiency bonus plus your Wisdom modifier.",
      },
    ],
    inventoryCurrency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    // Add spell data so the page-1 spell tracker renders level 1
    // spells + the dedicated spells page shows the spell list.
    // Mirrors the user's actual JSON after server-side spell
    // resolution (spellSelections → spellList + spellSlots).
    // User has multiple levels (their PDF showed up to level 9),
    // so populate 6 levels to exercise the multi-group layout.
    spellList: [
      { id: "cantrip-mage-hand", name: "Mage Hand", level: 0 },
      { id: "cantrip-minor-illusion", name: "Minor Illusion", level: 0 },
      { id: "cantrip-prestidigitation", name: "Prestidigitation", level: 0 },
      { id: "cantrip-vicious-mockery", name: "Vicious Mockery", level: 0 },
      { id: "l1-magic-mouth", name: "Magic Mouth", level: 1 },
      { id: "l2-lesser-restoration", name: "Lesser Restoration", level: 2 },
      { id: "l2-continual-flame", name: "Continual Flame", level: 2 },
      { id: "l2-mending", name: "Mending", level: 2 },
      { id: "l3-tongues", name: "Tongues", level: 3 },
      { id: "l3-major-image", name: "Major Image", level: 3 },
      { id: "l3-glyph-of-warding", name: "Glyph of Warding", level: 3 },
      { id: "l5-teleportation-circle", name: "Teleportation Circle", level: 5 },
      { id: "l6-polymorph", name: "Polymorph", level: 6 },
      { id: "l6-greater-invisibility", name: "Greater Invisibility", level: 6 },
      { id: "l7-resurrection", name: "Resurrection", level: 7 },
      { id: "l7-forcecage", name: "Forcecage", level: 7 },
      { id: "l8-feeblemind", name: "Feeblemind", level: 8 },
      { id: "l8-sunburst", name: "Sunburst", level: 8 },
      { id: "l8-animal-shapes", name: "Animal Shapes", level: 8 },
      { id: "l9-power-word-kill", name: "Power Word Kill", level: 9 },
      { id: "l9-wish", name: "Wish", level: 9 },
    ],
    spellSlots: {
      maxLevel: 9,
      slots: [
        { level: 1, slots: 4 },
        { level: 2, slots: 3 },
        { level: 3, slots: 3 },
        { level: 4, slots: 3 },
        { level: 5, slots: 1 },
        { level: 6, slots: 1 },
        { level: 7, slots: 1 },
        { level: 8, slots: 1 },
        { level: 9, slots: 1 },
      ],
      hasPactMagic: false,
      pactSlots: [],
      standardSlots: [
        { level: 1, slots: 4 },
        { level: 2, slots: 3 },
        { level: 3, slots: 3 },
        { level: 4, slots: 3 },
        { level: 5, slots: 1 },
        { level: 6, slots: 1 },
        { level: 7, slots: 1 },
        { level: 8, slots: 1 },
        { level: 9, slots: 1 },
      ],
    },
  },
};

character.backstory = {
  name: "Rangies",
  age: "123",
  height: "8 ft",
  weight: "120 lbs",
  gender: "Male",
  eyes: "Green",
  skin: "Pale",
  hair: "Black",
  appearance: "Eyes have a faint, unnatural reflective glow in low light; hair is often messy and moves as if disturbed by a slight, unseen breeze.",
  backstory: "Born into a subterranean community where silence was the only law, they learned early that the loudest voices were the first to die. They survived by becoming part of the shadows, mimicking the movements of the great wolf spiders that inhabited the cavern walls. A turning point came when they uncovered a conspiracy involving the abandonment of their clan by surface-dwelling merchants. Exiled for what they discovered, they now travel the world, weaving their own complex web of influence.",
  personalityTraits: "* Calculated and patient; willing to wait for the perfect moment to strike rather than rushing in.\n\n* Speaks in soft, rapid bursts, often shifting eyes to track multiple movements at once.",
  ideals: "* Adaptability: Survival dictates that one must change their approach based on the environment.\n\n* Autonomy: A creature should be the master of its own web; external control is an affront to nature.",
  bonds: "* Bound to a hidden cache of stolen documents, believing them to be the key to their past.\n\n* Owes a life-debt to an outcast druid who healed them from a near-fatal injury.",
  flaws: "* Territorial Anxiety: Becomes agitated and irrational when forced to stay in unfamiliar or \"unsecured\" locations.\n\n* Sensory Overload: In bright, loud, or crowded areas, they become panicked and disoriented.",
  alliesAndOrganizations: "* The Weaver's Guild (Secretive): A network of spies and rogues who utilize webs of misinformation.",
  additionalFeatures: "* Quirk: Habitually taps fingers against surfaces to feel vibrations in the air.\n\n* Quirk: Often climbs walls or sits on high rafters rather than sitting in chairs.",
};

character.pagePlan = [
  {
    kind: "inventory",
    number: 2,
    title: "Inventory",
    sections: [
      {
        id: "inventory-1",
        title: "Inventory cards",
        description: "Gear, attunement, notes, and item details.",
        cards: character.inventoryCards,
      },
    ],
    notes: [],
  },
  {
    kind: "spells",
    number: 3,
    title: "Spell List",
    sections: [
      {
        id: "spells-1",
        title: "Spell cards",
        description: "Prepared spells and at-will cantrips.",
        cards: character.spellCards,
      },
    ],
    notes: [],
  },
  {
    kind: "backstory",
    number: 4,
    title: "Backstory",
    sections: [],
    notes: [],
  },
];

console.log("→ POST /pdf-export");
const res = await fetch("http://localhost:3000/pdf-export", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(character),
});
console.log(`  status=${res.status} content-type=${res.headers.get("content-type")}`);
if (!res.ok) {
  const t = await res.text();
  console.error("ERROR:", t.slice(0, 2000));
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
console.log(`  bytes=${buf.length}`);
await writeFile("/Users/max/dev/Arcanum/.qa/rangies-test.pdf", buf);
console.log("  saved /Users/max/dev/Arcanum/.qa/rangies-test.pdf");

console.log("→ convert PDF to PNG");
try {
  execSync(`pdftoppm -png -r 200 /Users/max/dev/Arcanum/.qa/rangies-test.pdf /Users/max/dev/Arcanum/.qa/rangies-test`, { stdio: "inherit" });
} catch (e) {
  console.log("  pdftoppm failed:", e.message.slice(0, 200));
}

console.log("→ OCR");
try {
  const ocr = execSync(`tesseract /Users/max/dev/Arcanum/.qa/rangies-test-1.png - 2>/dev/null`, { encoding: "utf8" });
  console.log(ocr);
} catch (e) {
  console.log("  OCR failed:", e.message);
}