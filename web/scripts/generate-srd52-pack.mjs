import fs from "node:fs/promises";
import path from "node:path";

const sourceRoot = process.argv[2];
const outputPath = process.argv[3] ?? path.resolve("lib/content-packs/generated/srd52.json");

if (!sourceRoot) {
  throw new Error("Usage: node scripts/generate-srd52-pack.mjs <srd-5.2/en directory> [output]");
}

const SOURCE_URL = "https://www.dndbeyond.com/srd";
const ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sections(markdown, level) {
  const pattern = new RegExp(`^#{${level}} (.+)$`, "gm");
  const matches = [...markdown.matchAll(pattern)];
  return matches.map((match, index) => ({
    title: match[1].replace(/\*\*/g, "").trim(),
    body: markdown
      .slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? markdown.length)
      .trim(),
  }));
}

function cleanMarkdown(markdown) {
  return markdown
    .replace(/^Table: .+$/gm, "")
    .replace(/^\|.*\|$/gm, "")
    .replace(/^[-| :]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function baseEntry({ id, type, name, description, supports = [], rules = [], setters = [], ...extra }) {
  return {
    id,
    type,
    name,
    source: "System Reference Document 5.2.1",
    sourceUrl: SOURCE_URL,
    supports,
    description: cleanMarkdown(description),
    rules,
    setters,
    ...extra,
  };
}

function tableCells(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function numericCell(value) {
  const normalized = String(value ?? "").replace(/[—–-]/g, "").trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : 0;
}

function parseSpellcastingProgression(markdown, className) {
  const lines = markdown.split("\n");
  const headerIndex = lines.findIndex(
    (line) => /^\|\s*Level\s*\|/.test(line) && /\b(?:Cantrips|Prepared Spells|Spell Slots)\b/.test(line),
  );
  if (headerIndex < 0) {
    return null;
  }
  const headers = tableCells(lines[headerIndex]);
  const rows = lines
    .slice(headerIndex + 2, headerIndex + 22)
    .map(tableCells)
    .filter((cells) => numericCell(cells[0]) > 0);
  const cantripIndex = headers.findIndex((header) => header === "Cantrips");
  const preparedIndex = headers.findIndex((header) => header === "Prepared Spells");
  const pactSlotsIndex = headers.findIndex((header) => header === "Spell Slots");
  const pactLevelIndex = headers.findIndex((header) => header === "Slot Level");
  const slotIndexes = headers
    .map((header, index) => (/^[1-9]$/.test(header) ? [Number(header), index] : null))
    .filter(Boolean);
  const rules = [];

  let previousCantrips = 0;
  let previousPrepared = 0;
  const previousSlots = new Map();
  let previousPactSlots = 0;
  let previousPactLevel = 0;

  rows.forEach((cells) => {
    const level = numericCell(cells[0]);
    if (cantripIndex >= 0) {
      const count = numericCell(cells[cantripIndex]);
      const delta = count - previousCantrips;
      if (delta > 0) {
        rules.push({
          kind: "select",
          type: "Spell",
          name: "Cantrips",
          supports: `${className}||0`,
          number: delta,
          level,
        });
      }
      previousCantrips = count;
    }

    if (preparedIndex >= 0) {
      const count = numericCell(cells[preparedIndex]);
      const delta = count - previousPrepared;
      if (delta) {
        rules.push({
          kind: "stat",
          name: `${slug(className)}:spellcasting:prepare`,
          value: String(delta),
          level,
        });
      }
      previousPrepared = count;
    }

    slotIndexes.forEach(([slotLevel, index]) => {
      const count = numericCell(cells[index]);
      const previous = previousSlots.get(slotLevel) ?? 0;
      const delta = count - previous;
      if (delta) {
        rules.push({
          kind: "stat",
          name: `${slug(className)}:spellcasting:slots:${slotLevel}`,
          value: String(delta),
          level,
        });
      }
      previousSlots.set(slotLevel, count);
    });

    if (pactSlotsIndex >= 0 && pactLevelIndex >= 0) {
      const count = numericCell(cells[pactSlotsIndex]);
      const slotLevel = numericCell(cells[pactLevelIndex]);
      if (previousPactLevel && (slotLevel !== previousPactLevel || count !== previousPactSlots)) {
        rules.push({
          kind: "stat",
          name: `${slug(className)}:spellcasting:slots:${previousPactLevel}`,
          value: String(-previousPactSlots),
          level,
        });
      }
      if (slotLevel && (slotLevel !== previousPactLevel || count !== previousPactSlots)) {
        rules.push({
          kind: "stat",
          name: `${slug(className)}:spellcasting:slots:${slotLevel}`,
          value: String(count),
          level,
        });
      }
      previousPactSlots = count;
      previousPactLevel = slotLevel;
    }
  });

  if (className === "Wizard") {
    rules.push(
      {
        kind: "select",
        type: "Spell",
        name: "Spellbook",
        supports: "Wizard||$(spellcasting:slots)",
        number: 6,
        level: 1,
      },
      {
        kind: "select",
        type: "Spell",
        name: "Spellbook",
        supports: "Wizard||$(spellcasting:slots)",
        number: 2,
        level: 2,
      },
    );
  }

  const abilityByClass = {
    Bard: "Charisma",
    Cleric: "Wisdom",
    Druid: "Wisdom",
    Paladin: "Charisma",
    Ranger: "Wisdom",
    Sorcerer: "Charisma",
    Warlock: "Charisma",
    Wizard: "Intelligence",
  };
  return {
    ability: abilityByClass[className] ?? "",
    list: className,
    name: className,
    rules,
  };
}

function parseSpellEntries(markdown) {
  const entries = [];
  let currentLevel = 0;
  for (const section of sections(markdown, 2)) {
    const levelMatch = section.title.match(/^(?:Cantrips \(Level 0\)|Level (\d+) Spells)$/);
    if (!levelMatch) continue;
    currentLevel = Number(levelMatch[1] ?? 0);

    for (const spell of sections(section.body, 3)) {
      const italic = spell.body.match(/^\*([^*]+)\*/m)?.[1] ?? "";
      const school = italic.match(/^([A-Za-z]+)\s+(?:Cantrip|Level \d+)/)?.[1] ?? "Unknown";
      const classList = italic.match(/\(([^)]+)\)/)?.[1] ?? "";
      const field = (name) =>
        spell.body.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([^\\n]+)`, "i"))?.[1]?.trim() ?? "";
      const components = field("Components");
      const duration = field("Duration");
      const description = spell.body
        .replace(/^\*[^*]+\*\s*/m, "")
        .replace(/^\*\*(Casting Time|Range|Components|Duration):\*\*.*$/gim, "")
        .trim();

      entries.push(baseEntry({
        id: `srd52:spell:${slug(spell.title)}`,
        type: "Spell",
        name: spell.title,
        description,
        supports: classList.split(",").map((value) => value.trim()).filter(Boolean),
        setters: [
          { name: "level", value: String(currentLevel) },
          { name: "school", value: school },
          { name: "time", value: field("Casting Time") || "—" },
          { name: "range", value: field("Range") || "—" },
          { name: "duration", value: duration || "—" },
          { name: "hasVerbalComponent", value: /\bV\b/.test(components) ? "true" : "false" },
          { name: "hasSomaticComponent", value: /\bS\b/.test(components) ? "true" : "false" },
          { name: "hasMaterialComponent", value: /\bM\b/.test(components) ? "true" : "false" },
          { name: "materialComponent", value: components.match(/\((.+)\)/)?.[1] ?? "" },
          { name: "isRitual", value: /\britual\b/i.test(italic) ? "true" : "false" },
          { name: "isConcentration", value: /\bconcentration\b/i.test(duration) ? "true" : "false" },
        ],
      }));
    }
  }
  return entries;
}

function parseOriginEntries(markdown) {
  const backgroundsBlock = markdown.match(/### Background Descriptions([\s\S]*?)## Character Species/)?.[1] ?? "";
  const speciesBlock = markdown.match(/### Species Descriptions([\s\S]*)/)?.[1] ?? "";
  const backgrounds = sections(backgroundsBlock, 4).map((entry) =>
    baseEntry({
      id: `srd52:background:${slug(entry.title)}`,
      type: "Background",
      name: entry.title,
      description: entry.body,
    }),
  );
  const races = sections(speciesBlock, 4).map((entry) => {
    const traitId = `srd52:racial-trait:${slug(entry.title)}-traits`;
    return [
      baseEntry({
        id: `srd52:race:${slug(entry.title)}`,
        type: "Race",
        name: entry.title,
        description: entry.body,
        rules: [{ kind: "grant", type: "Racial Trait", id: traitId }],
      }),
      baseEntry({
        id: traitId,
        type: "Racial Trait",
        name: `${entry.title} Traits`,
        description: entry.body,
        supports: [entry.title],
      }),
    ];
  }).flat();
  return [...backgrounds, ...races];
}

function parseFeatEntries(markdown) {
  const validStart = markdown.indexOf("### Origin Feats");
  return sections(markdown.slice(validStart), 4).map((entry) =>
    baseEntry({
      id: `srd52:feat:${slug(entry.title)}`,
      type: "Feat",
      name: entry.title,
      description: entry.body,
      setters: [
        {
          name: "category",
          value:
            entry.body.match(/\*\*Category:\*\*\s*([^\n]+)/i)?.[1]?.trim() ??
            "General",
        },
      ],
    }),
  );
}

async function parseClassEntries(directory) {
  const names = (await fs.readdir(directory))
    .filter((name) => /^\d+_.+\.md$/.test(name) && !name.startsWith("00_"))
    .sort();
  const entries = [];

  for (const fileName of names) {
    const markdown = await fs.readFile(path.join(directory, fileName), "utf8");
    const className = markdown.match(/^## (.+)$/m)?.[1]?.trim();
    if (!className) continue;
    const classId = `srd52:class:${slug(className)}`;
    const spellcasting = parseSpellcastingProgression(markdown, className);
    const subclassHeading = sections(markdown, 3).find((section) =>
      section.title.startsWith(`${className} Subclass:`),
    );
    const subclassStart = subclassHeading
      ? markdown.indexOf(`### ${subclassHeading.title}`)
      : markdown.length;
    const classBody = markdown.slice(0, subclassStart);
    const featureSections = sections(classBody, 4)
      .map((section) => ({
        ...section,
        level: Number(section.title.match(/^Level (\d+):/)?.[1] ?? 0),
        name: section.title.replace(/^Level \d+:\s*/, ""),
      }))
      .filter((section) => section.level > 0);
    const classRules = featureSections.map((feature) => ({
      kind: "grant",
      type: "Class Feature",
      id: `srd52:class-feature:${slug(className)}:level-${feature.level}:${slug(feature.name)}`,
      level: feature.level,
    }));

    entries.push(baseEntry({
      id: classId,
      type: "Class",
      name: className,
      description: classBody,
      rules: classRules,
      setters: [
        {
          name: "hd",
          value: markdown.match(/\|\s*Hit Point Die\s*\|\s*D(\d+)/i)?.[1] ?? "",
        },
      ],
    }));

    featureSections.forEach((feature) => {
      const isSubclassChoice = /subclass/i.test(feature.name);
      const isSpellcastingFeature =
        feature.name === "Spellcasting" ||
        (className === "Warlock" && feature.name === "Pact Magic");
      entries.push(baseEntry({
        id: `srd52:class-feature:${slug(className)}:level-${feature.level}:${slug(feature.name)}`,
        type: "Class Feature",
        name: feature.name,
        description: feature.body,
        supports: [className],
        rules: isSubclassChoice
          ? [{
              kind: "select",
              type: "Archetype",
              name: `${className} Subclass`,
              supports: `${className} Archetype`,
              level: feature.level,
            }]
          : isSpellcastingFeature && spellcasting
            ? spellcasting.rules
            : [],
        spellcasting:
          isSpellcastingFeature && spellcasting
            ? spellcasting
            : undefined,
      }));
    });

    if (subclassHeading) {
      const subclassName = subclassHeading.title.split(":").slice(1).join(":").trim();
      const archetypeId = `srd52:archetype:${slug(className)}:${slug(subclassName)}`;
      const subclassFeatures = sections(subclassHeading.body, 4)
        .map((section) => ({
          ...section,
          level: Number(section.title.match(/^Level (\d+):/)?.[1] ?? 0),
          name: section.title.replace(/^Level \d+:\s*/, ""),
        }))
        .filter((section) => section.level > 0);
      entries.push(baseEntry({
        id: archetypeId,
        type: "Archetype",
        name: subclassName,
        description: subclassHeading.body,
        supports: [`${className} Archetype`],
        rules: subclassFeatures.map((feature) => ({
          kind: "grant",
          type: "Archetype Feature",
          id: `srd52:archetype-feature:${slug(className)}:${slug(subclassName)}:level-${feature.level}:${slug(feature.name)}`,
          level: feature.level,
        })),
      }));
      subclassFeatures.forEach((feature) => {
        entries.push(baseEntry({
          id: `srd52:archetype-feature:${slug(className)}:${slug(subclassName)}:level-${feature.level}:${slug(feature.name)}`,
          type: "Archetype Feature",
          name: feature.name,
          description: feature.body,
          supports: [subclassName],
        }));
      });
    }
  }
  return entries;
}

const [spells, origins, feats, classes] = await Promise.all([
  fs.readFile(path.join(sourceRoot, "07_Spells.md"), "utf8").then(parseSpellEntries),
  fs.readFile(path.join(sourceRoot, "04_CharacterOrigins.md"), "utf8").then(parseOriginEntries),
  fs.readFile(path.join(sourceRoot, "05_Feats.md"), "utf8").then(parseFeatEntries),
  parseClassEntries(path.join(sourceRoot, "03_Classes")),
]);

const pack = {
  format: "arcanum.content-pack",
  schemaVersion: 1,
  id: "srd52",
  name: "System Reference Document 5.2.1",
  version: "5.2.1",
  ruleset: "dnd5e-2024",
  language: "en",
  sourceUrl: SOURCE_URL,
  generatedAt: new Date().toISOString(),
  license: {
    name: "Creative Commons Attribution 4.0 International",
    url: "https://creativecommons.org/licenses/by/4.0/legalcode",
    attribution: ATTRIBUTION,
    redistributionAllowed: true,
  },
  entries: [...origins, ...classes, ...feats, ...spells],
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`);
console.log(`Generated ${pack.entries.length} SRD 5.2.1 entries at ${outputPath}`);
