// Build a minimal ResolvedPdfCharacter to test the f108d7e baseline PDF.
// Schema strictly follows web/lib/pdf/types.ts ResolvedPdfCharacter.

import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const character = {
  id: "qa-artific",
  name: "Artific",
  playerName: "QA",
  level: 5,
  raceLabel: "Dragonborn",
  subraceLabel: "",
  classLabel: "Ranger 5",
  subclassLabel: "Beast Master Ranger",
  backgroundLabel: "Acolyte",
  alignment: "Neutral",
  deity: "Tymora",
  stats: [],
  frontPage: {
    stats: [
      { id: "prof-bonus", label: "Proficiency Bonus", value: "+3" },
      { id: "initiative", label: "Initiative", value: "+3" },
      { id: "attacks", label: "Attacks Per Action", value: "2" },
      { id: "inspiration", label: "Inspiration", value: "" },
      { id: "exhaustion", label: "Exhaustion Lvl", value: "" },
      { id: "max-hp", label: "Max HP", value: "55" },
      { id: "hp", label: "HP", value: "" },
      { id: "temp-hp", label: "Temp. HP", value: "" },
      { id: "hit-dice", label: "Hit Dice", value: "5d10" },
      { id: "defenses", label: "Defenses", value: "18" },
    ],
    abilityRows: [
      { id: "str", label: "STR", score: 13, modifier: 1, saveBonus: -1, saveProficient: false },
      { id: "dex", label: "DEX", score: 16, modifier: 3, saveBonus: 6, saveProficient: true },
      { id: "con", label: "CON", score: 15, modifier: 2, saveBonus: 5, saveProficient: true },
      { id: "int", label: "INT", score: 16, modifier: 3, saveBonus: 4, saveProficient: false },
      { id: "wis", label: "WIS", score: 20, modifier: 5, saveBonus: 8, saveProficient: true },
      { id: "cha", label: "CHA", score: 19, modifier: 4, saveBonus: 6, saveProficient: true },
    ],
    skillRows: [
      { id: "athletics", label: "Athletics", ability: "STR", proficient: false, expertise: false, total: 1 },
      { id: "acrobatics", label: "Acrobatics", ability: "DEX", proficient: true, expertise: false, total: 6 },
      { id: "sleight", label: "Sleight of Hand", ability: "DEX", proficient: true, expertise: false, total: 3 },
      { id: "stealth", label: "Stealth", ability: "DEX", proficient: true, expertise: false, total: 3 },
      { id: "arcana", label: "Arcana", ability: "INT", proficient: false, expertise: false, total: 3 },
      { id: "history", label: "History", ability: "INT", proficient: false, expertise: false, total: 3 },
      { id: "investigation", label: "Investigation", ability: "INT", proficient: false, expertise: false, total: 3 },
      { id: "nature", label: "Nature", ability: "INT", proficient: false, expertise: false, total: 3 },
      { id: "religion", label: "Religion", ability: "INT", proficient: true, expertise: false, total: 6 },
      { id: "ah", label: "Animal Handling", ability: "WIS", proficient: false, expertise: false, total: 3 },
      { id: "insight", label: "Insight", ability: "WIS", proficient: true, expertise: false, total: 8 },
      { id: "medicine", label: "Medicine", ability: "WIS", proficient: false, expertise: false, total: 5 },
      { id: "perception", label: "Perception", ability: "WIS", proficient: true, expertise: false, total: 5 },
      { id: "survival", label: "Survival", ability: "WIS", proficient: false, expertise: false, total: 5 },
      { id: "deception", label: "Deception", ability: "CHA", proficient: false, expertise: false, total: 4 },
      { id: "intimidation", label: "Intimidation", ability: "CHA", proficient: false, expertise: false, total: 4 },
      { id: "performance", label: "Performance", ability: "CHA", proficient: false, expertise: false, total: 7 },
      { id: "persuasion", label: "Persuasion", ability: "CHA", proficient: false, expertise: false, total: 4 },
    ],
    attackRows: [
      { id: "dethbow", name: "Dethbow", hit: "+4", damage: "1d8+1", damageType: "piercing", properties: "amm, heavy, two-handed" },
    ],
    proficiencyGroups: {
      weapons: ["Simple Weapons, Martial Weapons"],
      armor: ["Light Armor, Medium Armor, Shields"],
      tools: ["Set Of Common Clothes"],
      vehicles: [""],
      languages: ["Common, Draconic, Dwarvish, Abyssal, Celestial"],
    },
    deck: [
      {
        id: "primeval-awareness",
        title: "Primeval Awareness",
        kind: "class",
        contentKind: "feature",
        summary: "Action | 1/long rest | Beginning at 3rd level, you can use your **action** and expend one ranger spell slot to focus your awareness on the region around you. For 1 minute per level of the spell slot you expend, you can sense whether the following types of creatures are present within 1 mile of you.",
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
        { id: "draconic-ancestry", title: "Draconic Ancestry", kind: "racial", contentKind: "feature", summary: "You have draconic ancestry.", detail: "You have draconic ancestry.", tags: [], priority: 0 },
        { id: "breath-weapon", title: "Breath Weapon", kind: "racial", contentKind: "feature", summary: "Lightning breath", detail: "Exhale destructive energy. Your breath weapon deals 4d6 Lightning damage in a 5 by 30 ft. line (Dex. save) DC 16", tags: [], priority: 0 },
        { id: "damage-resistance", title: "Damage Resistance", kind: "racial", contentKind: "feature", summary: "Lightning", detail: "You have resistance to Lightning.", tags: [], priority: 0 },
      ],
      subracialCards: [],
      feats: [],
      conditions: [],
      senses: [],
      notes: [],
    },
    notes: [],
    capacity: 0,
    combatHub: { weaponRows: [], hasSpells: false },
  },
  companionCards: [],
  inventoryCards: [
    {
      id: "beads",
      kind: "item-description",
      title: "Prayer Beads",
      includeInItemDescriptions: true,
      rarity: "",
      itemType: "Wondrous Item",
      weight: "",
      attunable: true,
      attuned: true,
      detailHtml: "<p><strong>Prayer Beads (Signature Item)</strong></p><p><strong>Bead Count:</strong> 25 beads (some have symbols, some don't yet). <strong>Usage:</strong> Each bead can be used once per long rest.</p><p><strong>Activation:</strong> Requires a **Bonus Action** to use a bead.</p><p>**Praying Mantis Style** **Swiftness** **Effect:** As part of that action you make, you can also move up to 15 ft. towards a target without provoking opportunity attacks.</p><p><strong>Saving Face:</strong> When you fail a Charisma (Deception) check, you can use your reaction to reroll the check with a bonus equal to your Wisdom modifier. Once used, this property can't be used again until you finish a long rest.</p>",
    },
    {
      id: "outbow",
      kind: "item-description",
      title: "Outbow",
      includeInItemDescriptions: true,
      rarity: "Very Rare",
      itemType: "Magic Weapon",
      weight: "",
      attunable: true,
      attuned: false,
      detailHtml: "<p><strong>Outbow (Very Rare Magic Weapon)</strong></p><p>When you nock an arrow on this bow, it whispers in Elvish, \"Swift defeat to my enemies.\" When you use this weapon to make a ranged attack, you can, as a command phrase, say, \"Swift death to you who has wronged me.\" The target of your attack becomes your sworn enemy until it dies or until dawn seven days later.</p>",
    },
    {
      id: "cloak",
      kind: "item-description",
      title: "Cloak of Displacement",
      includeInItemDescriptions: true,
      rarity: "Rare",
      itemType: "Magic Item",
      weight: "",
      attunable: true,
      attuned: false,
      detailHtml: "<p><strong>Cloak of Displacement (Rare Magic Item)</strong></p><p>While you wear this cloak, it projects an illusion that makes you appear to be in a place near your actual location, causing any creature to have disadvantage on attack rolls against you.</p>",
    },
  ],
  spellCards: [
    {
      id: "cantrips",
      kind: "spell-list",
      title: "Spell List",
      level: 0,
      spells: [
        { name: "Alarm", level: 1 },
        { name: "Cure Wounds", level: 1 },
        { name: "Detect Poison and Disease", level: 1 },
        { name: "Animal Friendship", level: 1 },
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
    id: "qa-artific",
    name: "Artific",
    classEntries: [],
    level: 5,
    abilities: { str: 13, dex: 16, con: 15, int: 16, wis: 20, cha: 19 },
    skillProficiencies: [],
    saveProficiencies: [],
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: [],
    inventoryItems: [
      {
        id: "cube",
        name: "Cube of Force",
        quantity: 1,
        weight: "0 lb.",
        equipped: false,
        attuned: true,
        attunable: true,
        rarity: "Rare",
        itemType: "Wondrous Item",
        category: "wondrous",
        includeInItemDescriptions: true,
        sheetDescription: "<p><strong>Cube of Force (Rare Magic Item)</strong></p><p>This cube is about an inch across. Each face has a distinct marking on it that can be pressed. The cube starts with 36 charges, and it regains 1d20 expended charges daily at dawn.</p><p>You can use an action to press one of the cube's faces, expending a number of charges based on the chosen face, as shown in the Cube of Force Faces table.</p><p>Each face has a different effect. If the cube has insufficient charges remaining, nothing happens. Otherwise, a barrier of invisible force springs into existence, forming a cube 15 feet on a side. The barrier is centered on you, moves with you, and lasts for 1 minute, until you use an action to press the cube's sixth face, or the cube runs out of charges.</p>",
      },
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
        sheetDescription: "<p><strong>Oathbow (Very Rare Magic Weapon, Attunement Required)</strong></p><p>When you nock an arrow on this bow, it whispers in Elvish, \"Swift defeat to my enemies.\" When you use this weapon to make a ranged attack, you can, as a command phrase, say, \"Swift death to you who has wronged me.\" The target of your attack becomes your sworn enemy until it dies or until dawn seven days later.</p><p>While your sworn enemy lives, you have advantage on attack rolls with this weapon against your sworn enemy. In addition, your target gains no benefit from cover, other than total cover, and you suffer no disadvantage due to long range. If the attack hits, your sworn enemy takes an extra 3d6 piercing damage.</p><p>While your sworn enemy lives, you have disadvantage on attack rolls with all other weapons.</p>",
      },
      {
        id: "beads",
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
        sheetDescription: "<p><strong>Prayer Beads (Signature Item, Wondrous)</strong> 25 beads (some have symbols, some don't yet). Each bead can be used once per long rest. <strong>Bead Count:</strong> 25 beads (some have symbols, some don't yet). <strong>Usage:</strong> Each bead can be used once per long rest. <strong>Activation:</strong> Requires a <strong>Bonus Action</strong> to use a bead. <strong>Praying Mantis Style</strong> <strong>Swiftness</strong> <strong>Effect:</strong> As part of that action you make, you can also move up to 15 ft. towards a target without provoking opportunity attacks. <strong>Saving Face:</strong> When you fail a Charisma (Deception) check, you can use your reaction to reroll the check with a bonus equal to your Wisdom modifier. Once used, this property can't be used again until you finish a long rest. <strong>Iron Feet</strong> = 2x Successful Unarmed Strike (Fist). <strong>Earth Strikes</strong> Strike (fist) = You may make one additional attack striking with both fists, (additional +1 to hit) dealing +4 damage with your fists. <strong>Iron Clad Style</strong> = 2x Successful Unarmed Strike (Fist) iron feet = YOU gain +4 bonus to AC, and you have advantage on Strength and Constitution saving throws. <strong>Snake Style</strong> = 2x Successful Unarmed Strike (Fist) <strong>Lightning Strike</strong> = enemies hit by your unarmed strikes must make a CON saving throw (Ki DC); they take 1d6 lightning damage on a fail and are stunned until the next round. <strong>Lightning Style</strong> = As a bonus action, make 1 attack (Unarmed) at the end; you make 1 attack; enemies within 15 ft of targeted enemy must make a CON save or take 1d6 damage as well, and have 50% to miss. <strong>Snake's Reflexes</strong> = you may take the Disengage action this turn; grants +10 ft of movement for this turn. <strong>Seven-sided strike</strong> = Part of the bonus action, you may quickly attack up to 3 enemies within a 20 ft radius (only 1 attack); you can't be targeted by spells and attacks, and gain Evasion (if applicable). <strong>Seventy seven fists</strong> = any combination of melee attacks, you must attack 9 enemies with a minimum of 1 attack each; you may cast \"Seven-sided Strike\" again as a bonus action next turn. <strong>Seven strikes</strong> = 7X successful Melee Attacks. <strong>Mantra of Evasion</strong> = You must keep still and maintain concentration; all projectiles are slowed; allies within the area gain ADV on DEX saving throws; you may only use Deflect Missiles, but can do so twice/turn and can target projectiles aimed at your allies within 10 ft. <strong>Mantra of Retribution</strong> = You must stand still and attack, as well as maintain concentration; when one of your allies within 20 ft is hit with an attack or spell, the attacker takes damage equal to your WIS modifier. <strong>Mantra of Perseverance</strong> = You must move at least 40 ft each turn, as well as maintaining concentration; allies within 60 ft regain spent resources once every 2 turns while affected by this (2 sorcery points, 1 savage point, 1 ki point, 1 luck point, etc.). <strong>Divine Palm</strong> = 2/part of the action, you may dash to an ally and place your hand on them: if you do so, you leave a shiny mark on the target that lasts until the end of the next turn: if the target takes damage that would reduce them under 1 hit point, the ally then remains with 1 hit point; you also take 60% of the damage from that attack. <strong>Open Hand Mastery</strong> = increases the maximum number of Ki Points you can have by 4 and your Save DC by 2. <strong>Epiphany</strong> = Part of the bonus action, you take the Dash or the Dodge action; up until your next route, a successful attack roll may grant 1 reaction; if an attack misses you, you may use 1 Ki point to make a melee weapon attack/unarmed strike against the attacking target. <strong>Monk style</strong> = 1x Unarmed + 1x Weapon #1 + 1x Unarmed + 1x Weapon attack: if all attacks hit, Epiphany continues for 1 more turn. <strong>Dragon's Tail</strong> = as part of the bonus action, make an Unarmed Attack against the target (free): you may also spend up to 50% of your maximum Ki points to gain +5 to hit and +3 damage/2 Ki points spent on this attack; upon a hit, the target must make an Athletics/Acrobatics check or be knocked 30 ft back. <strong>Eynak's Touch 5x10x10</strong> = as an action you may cure any condition (except incapacitated), curse or disease, and remove 1 level of exhaustion on a target, alternatively, you may inflict any condition (except incapacitated) and select levels of exhaustion on the target.</p>",
      },
    ],
    inventoryCurrency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  },
};

// Build a minimal pagePlan so the export route emits inventory + spells + backstory pages.
character.backstory = {
  name: "Artific",
  age: "27",
  height: "5 ft 9 in",
  weight: "152 lbs",
  gender: "Nonbinary",
  eyes: "Copper",
  skin: "Bronze",
  hair: "Black",
  appearance: "Bronze-scaled dragonborn with copper eyes and a long scar across the left forearm.",
  backstory: "Born in the Draconic Warrens, Artific was apprenticed to a tinker who taught them to combine arcane theory with mechanical craft.",
  personalityTraits: "Methodical, curious, quietly confident.",
  ideals: "Knowledge is the sharpest tool.",
  bonds: "My mentor's journal, half-burned, is my most prized possession.",
  flaws: "I over-explain when I'm nervous.",
  alliesAndOrganizations: "The Tinkers' Guild of [City].",
  additionalFeatures: "A small mechanical bird that still ticks.",
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
    notes: ["Inventory follows companion when present."],
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
await writeFile("/Users/max/dev/Arcanum/.qa/artific-test.pdf", buf);
console.log("  saved /Users/max/dev/Arcanum/.qa/artific-test.pdf");

console.log("→ convert PDF to PNG");
try {
  execSync(`sips -s format png /Users/max/dev/Arcanum/.qa/artific-test.pdf --out /Users/max/dev/Arcanum/.qa/artific-test.png 2>&1 | tail -1`, { stdio: "pipe" });
  console.log("  converted via sips");
} catch (e) {
  console.log("  sips failed:", e.message.slice(0, 200));
  try {
    execSync(`pdftoppm -png -r 200 /Users/max/dev/Arcanum/.qa/artific-test.pdf /Users/max/dev/Arcanum/.qa/artific-test`, { stdio: "inherit" });
  } catch (e2) {
    console.log("  pdftoppm failed:", e2.message.slice(0, 200));
  }
}

console.log("→ OCR");
try {
  const ocr = execSync(`tesseract /Users/max/dev/Arcanum/.qa/artific-test.png - 2>/dev/null`, { encoding: "utf8" });
  console.log(ocr);
} catch (e) {
  console.log("  OCR failed:", e.message);
}
