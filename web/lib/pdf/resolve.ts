import type { BuiltInElement } from "@/lib/builtins/types";
import type {
  CharacterBackstory,
  CharacterInventoryItem,
  CharacterManualGrant,
} from "@/lib/characters/types";

import { PDF_SVG_COMPONENT_MANIFEST } from "@/lib/pdf/assets";
import type {
  PdfAppendixEntry,
  PdfAttackRow,
  PdfAbilityScoreRow,
  PdfCardKind,
  PdfCombatHub,
  PdfCombatHubSpellColumn,
  PdfContentKind,
  PdfFrontPageComposition,
  PdfPageCard,
  PdfPageKind,
  PdfPagePlan,
  PdfPageSection,
  PdfProficiencyGroups,
  PdfResolveSource,
  PdfRightColumnCompactTrait,
  PdfRightColumnNoteLine,
  PdfSpellListEntry,
  PdfSpellSlots,
  PdfStatBlock,
  PdfSkillRow,
  ResolvedPdfCharacter,
} from "@/lib/pdf/types";

const FRONT_PAGE_DECK_CAPACITY = 12;
const INVENTORY_PAGE_CAPACITY = 8;
const SPELL_PAGE_CAPACITY = 16;
const APPENDIX_PAGE_CAPACITY = 6;

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentencePreview(value: string, fallback = "No short summary available.") {
  const cleaned = stripHtml(value);
  if (!cleaned) {
    return fallback;
  }

  const sentence = cleaned.match(/.+?[.!?](?:\s|$)/)?.[0]?.trim() ?? cleaned;
  return sentence.length > 360 ? `${sentence.slice(0, 357)}...` : sentence;
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeTags(tags: string[] | undefined) {
  return uniqueStrings((tags ?? []).map(normalizeText).filter(Boolean));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function noteKey(title: string, value: string) {
  const normalizedValue = normalizeText(value)
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/\bfeet\b/g, "ft")
    .replace(/\s+/g, " ");
  return `${title.toLowerCase()}::${normalizedValue}`;
}

const CONDITION_NAMES = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;

const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

const INVALID_NOTE_VALUE_PATTERN =
  /\b(?:being|one of the following|following|your choice|of your choice|chosen type|chosen damage type|damage of the chosen type|associated with|determined by|gm chooses|dm chooses|randomly|any type|a type)\b/i;

function canonicalizeDamageList(value: string) {
  const normalized = normalizeText(value)
    .replace(/\bdamage\b/gi, "")
    .replace(/\btypes?\b/gi, "")
    .replace(/\bfrom\b.*$/i, "")
    .replace(/\.$/, "")
    .trim();

  if (!normalized || INVALID_NOTE_VALUE_PATTERN.test(normalized)) {
    return null;
  }

  const parts = normalized
    .toLowerCase()
    .replace(/\bor\b/g, ",")
    .replace(/\band\b/g, ",")
    .replace(/\//g, ",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const canonical = parts
    .map((part) => DAMAGE_TYPES.find((damageType) => damageType === part))
    .filter((part): part is (typeof DAMAGE_TYPES)[number] => Boolean(part));

  if (!canonical.length || canonical.length !== parts.length) {
    return null;
  }

  return uniqueStrings(canonical.map(titleCase)).join(", ");
}

function selfGrantSentences(text: string) {
  return stripHtml(text)
    .split(/(?<=[.!?])\s+/)
    .map(normalizeText)
    .filter((sentence) =>
      /\b(?:you (?:are|become|have|gain|gains|can't|cannot|can not|don't|do not)|your .* grants you|makes you|make you|grants you)\b/i.test(sentence),
    );
}

function pushCanonicalDamageNote(
  pushLine: (title: string, value: string) => void,
  title: string,
  value: string | undefined,
) {
  if (!value) {
    return;
  }

  const canonical = canonicalizeDamageList(value);
  if (canonical) {
    pushLine(title, canonical);
  }
}

function getCardPriority(kind: PdfCardKind, contentKind: PdfContentKind, pageHint?: PdfPageKind | "front-rail") {
  const kindWeight: Record<PdfCardKind, number> = {
    trait: 10,
    feature: 20,
    condition: 30,
    sense: 35,
    proficiency: 40,
    language: 45,
    item: 60,
    spell: 70,
    note: 80,
  };
  const contentWeight: Record<PdfContentKind, number> = {
    summary: 0,
    table: 5,
    detail: 10,
    appendix: 20,
  };

  return kindWeight[kind] + contentWeight[contentKind] + (pageHint === "front-rail" ? -5 : 0);
}

function getContentKindFromDetail(detail?: string) {
  if (!detail) {
    return "summary" as const;
  }

  const length = stripHtml(detail).length;
  if (length > 1200) {
    return "appendix" as const;
  }
  if (length > 350) {
    return "detail" as const;
  }
  return "summary" as const;
}

function inferWidthHint(kind: PdfCardKind, detail?: string) {
  const length = stripHtml(detail ?? "").length;
  if (kind === "item" || kind === "spell" || length > 500) {
    return "wide" as const;
  }
  if (length > 180) {
    return "medium" as const;
  }
  return "small" as const;
}

function resolveCardKind(element: BuiltInElement): PdfCardKind {
  if (/companion/i.test(element.type)) {
    return "feature";
  }
  if (/trait/i.test(element.type)) {
    return "trait";
  }
  if (/condition/i.test(element.type)) {
    return "condition";
  }
  if (/language/i.test(element.type)) {
    return "language";
  }
  if (/proficiency/i.test(element.type)) {
    return "proficiency";
  }
  if (/spell/i.test(element.type)) {
    return "spell";
  }
  if (/feat/i.test(element.type)) {
    return "feature";
  }
  return "feature";
}

export function toPdfCardFromElement(
  element: BuiltInElement,
  overrides?: Partial<Pick<PdfPageCard, "kind" | "contentKind" | "pageHint" | "priority" | "sourceLabel" | "summary" | "detail" | "tags" | "widthHint" | "sourceAction">>,
) {
  const detail = overrides?.detail ?? element.descriptionHtml ?? element.description;
  const kind = overrides?.kind ?? resolveCardKind(element);
  const contentKind = overrides?.contentKind ?? getContentKindFromDetail(detail);
  const pageHint = overrides?.pageHint;

  return {
    id: element.id,
    title: element.name,
    kind,
    contentKind,
    summary: overrides?.summary ?? sentencePreview(detail),
    detail,
    sourceLabel: overrides?.sourceLabel ?? element.source,
    sourceAction: overrides?.sourceAction ?? element.sheet?.action,
    tags: normalizeTags([element.type, ...(element.supports ?? [])]),
    priority: overrides?.priority ?? getCardPriority(kind, contentKind, pageHint),
    pageHint,
    widthHint: overrides?.widthHint ?? inferWidthHint(kind, detail),
  } satisfies PdfPageCard;
}

export function toPdfCardFromGrant(grant: CharacterManualGrant) {
  const detail = grant.detailHtml ?? grant.description ?? grant.note ?? "";
  const kind: PdfCardKind =
    grant.kind === "spell"
      ? "spell"
      : grant.kind === "language"
        ? "language"
        : grant.kind === "proficiency"
          ? "proficiency"
          : grant.kind === "feat"
            ? "feature"
            : grant.kind === "asi"
              ? "note"
              : "feature";
  const contentKind = getContentKindFromDetail(detail);

  return {
    id: grant.id,
    title: grant.name,
    kind,
    contentKind,
    summary: sentencePreview(detail, grant.note || grant.description || "Manual grant"),
    detail: detail || undefined,
    sourceLabel: grant.source || "Manual / DM grant",
    tags: normalizeTags([grant.kind, grant.refId ? "referenced" : "custom"]),
    priority: getCardPriority(kind, contentKind),
    widthHint: inferWidthHint(kind, detail),
  } satisfies PdfPageCard;
}

export function toPdfCardFromInventoryItem(item: CharacterInventoryItem) {
  const detail = item.detailHtml ?? item.notes ?? "";
  const contentKind = getContentKindFromDetail(detail);
  return {
    id: item.id,
    title: item.name,
    kind: "item",
    contentKind,
    summary: sentencePreview(detail, item.notes || item.name),
    detail: detail || undefined,
    sourceLabel: item.sourceLabel || item.sourceName || item.source,
    tags: normalizeTags([item.category, item.family ?? "", item.rarity ?? "", item.slot ?? ""]),
    priority: getCardPriority("item", contentKind),
    widthHint: inferWidthHint("item", detail),
  } satisfies PdfPageCard;
}

function statBlockToCard(stat: PdfStatBlock) {
  return {
    id: stat.id,
    title: stat.label,
    kind: "note" as const,
    contentKind: "summary" as const,
    summary: stat.value,
    detail: stat.meta,
    sourceLabel: "Derived sheet stat",
    tags: ["stat"],
    priority: 5,
    pageHint: "front-rail" as const,
    widthHint: "small" as const,
  } satisfies PdfPageCard;
}

function backstoryToCards(backstory?: CharacterBackstory) {
  if (!backstory) {
    return [];
  }

  const entries: Array<[string, string, string]> = [
    ["personality-traits", "Personality traits", backstory.personalityTraits],
    ["ideals", "Ideals", backstory.ideals],
    ["bonds", "Bonds", backstory.bonds],
    ["flaws", "Flaws", backstory.flaws],
    ["allies-and-organizations", "Allies and organizations", backstory.alliesAndOrganizations],
    ["backstory", "Backstory", backstory.backstory],
    ["additional-features", "Additional features", backstory.additionalFeatures],
  ];

  return entries
    .filter(([, , value]) => Boolean(normalizeText(value)))
    .map(([id, title, value]) => ({
      id,
      title,
      kind: "note" as const,
      contentKind: "detail" as const,
      summary: sentencePreview(value),
      detail: value,
      sourceLabel: "Backstory",
      tags: ["backstory"],
      priority: 90,
      pageHint: "backstory" as const,
      widthHint: "wide" as const,
    }));
}

function toPdfAppendixEntryFromCard(card: PdfPageCard): PdfAppendixEntry {
  return {
    id: card.id,
    title: card.title,
    kind: "appendix",
    body: card.detail || card.summary,
    sourceLabel: card.sourceLabel,
    tags: [...card.tags],
  };
}

function normalizeCard(card: PdfPageCard) {
  return {
    ...card,
    summary: normalizeText(card.summary),
    detail: card.detail ? normalizeText(card.detail) : undefined,
    tags: normalizeTags(card.tags),
    priority: Number.isFinite(card.priority) ? Math.floor(card.priority) : 100,
  };
}

function cardHasGroup(card: PdfPageCard, group: string) {
  return card.tags.includes(`pdf-group:${group}`);
}

function pushRightColumnNote(
  lines: PdfRightColumnNoteLine[],
  seen: Set<string>,
  title: string,
  value: string,
) {
  const normalized = normalizeText(value);
  if (!normalized || INVALID_NOTE_VALUE_PATTERN.test(normalized)) {
    return;
  }

  const key = noteKey(title, normalized);
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  lines.push({
    id: `r3-note-${key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    title,
    value: normalized,
  });
}

function pushConditionImmunityNotes(sentences: string[], pushLine: (title: string, value: string) => void) {
  sentences.forEach((sentence) => {
    CONDITION_NAMES.forEach((condition) => {
      const conditionPattern = condition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`\\byou (?:are|become) immune to (?:being |the )?${conditionPattern}(?: condition)?\\b`, "i"),
        new RegExp(`\\byou have immunity to (?:being |the )?${conditionPattern}(?: condition)?\\b`, "i"),
        new RegExp(`\\b(?:makes you|make you|grants you) immune to (?:being |the )?${conditionPattern}(?: condition)?\\b`, "i"),
      ];
      if (patterns.some((pattern) => pattern.test(sentence))) {
        pushLine("Condition", `Immune ${titleCase(condition)}`);
      }
    });

    if (/magic can'?t put you to sleep|you (?:are|become) immune to (?:being )?(?:put to )?sleep|you have immunity to sleep/i.test(sentence)) {
      pushLine("Condition", "Immune Sleep");
    }
  });
}

function extractRightColumnNotesFromText(title: string, text: string, tags: string[] = []) {
  const lines: PdfRightColumnNoteLine[] = [];
  const seen = new Set<string>();
  const pushLine = (title: string, value: string) => pushRightColumnNote(lines, seen, title, value);

  tags
    .filter((tag) => tag.startsWith("pdf-note:"))
    .forEach((tag) => {
      const [, kind, ...rest] = tag.split(":");
      if (!kind || !rest.length) {
        return;
      }

      const titleMap: Record<string, string> = {
        resistance: "Resistance",
        vulnerability: "Vulnerability",
        immunity: "Immunity",
        condition: "Condition",
        "condition-edge": "Condition",
        rest: "Rest",
        sense: "Sense",
        speed: "Speed",
      };
      const title = titleMap[kind] ?? titleCase(kind);
      const value = rest.join(":");
      if (title === "Resistance" || title === "Vulnerability") {
        pushCanonicalDamageNote(pushLine, title, value);
        return;
      }
      if (title === "Immunity" && !/^Disease$/i.test(value)) {
        pushCanonicalDamageNote(pushLine, title, value);
        return;
      }
      pushLine(title, value);
    });

  const body = stripHtml(text);
  const source = `${title} ${body}`.toLowerCase();
  const sentences = selfGrantSentences(body);

  if (sentences.some((sentence) => /(?:resistance (?:to|against) poison damage|poison resistance|resistant to poison damage)/i.test(sentence))) {
    pushLine("Resistance", "Poison");
  }
  sentences.forEach((sentence) => {
    const resistanceMatch = sentence.match(/resistance (?:to|against) ([a-z ,/-]+?) damage/i);
    pushCanonicalDamageNote(pushLine, "Resistance", resistanceMatch?.[1]);

    const resistantMatch = sentence.match(/resistant to ([a-z ,/-]+?) damage/i);
    pushCanonicalDamageNote(pushLine, "Resistance", resistantMatch?.[1]);

    const vulnerabilityMatch = sentence.match(/vulnerab(?:le|ility) to ([a-z ,/-]+?) damage/i);
    pushCanonicalDamageNote(pushLine, "Vulnerability", vulnerabilityMatch?.[1]);

    if (/immune to disease|immunity to disease/i.test(sentence)) {
      pushLine("Immunity", "Disease");
    }

    const immunityDamageMatch = sentence.match(/immune to ([a-z ,/-]+?) damage/i);
    pushCanonicalDamageNote(pushLine, "Immunity", immunityDamageMatch?.[1]);

    const immunityListMatch = sentence.match(/(?:immune to|immunity to) ([a-z ,/-]+?)(?:\.|$)/i);
    if (immunityListMatch && /poison/i.test(immunityListMatch[1])) {
      pushLine("Immunity", "Poison");
    }
  });
  pushConditionImmunityNotes(sentences, pushLine);
  if (sentences.some((sentence) => /advantage on saving throws against being poisoned|advantage .* poisoned/i.test(sentence))) {
    pushLine("Condition", "Adv. vs Poisoned");
  }
  if (sentences.some((sentence) => /don'?t need to sleep|sentry'?s rest/i.test(sentence))) {
    pushLine("Rest", "Sentry's Rest");
  }
  const darkvisionMatch = body.match(/darkvision(?:\s+out\s+to|\s+to|\s+of)?\s+(\d+)\s*feet?/i);
  if (darkvisionMatch) {
    pushLine("Sense", `Darkvision ${darkvisionMatch[1]} ft`);
  }
  const speedMatch = body.match(/walking speed is increased by (\d+) feet?/i);
  if (speedMatch) {
    pushLine("Speed", `+${speedMatch[1]} ft`);
  }
  const flightMatch = body.match(/flying speed of (\d+) feet|you have a flying speed of (\d+) feet/i);
  const flightValue = flightMatch?.[1] || flightMatch?.[2];
  if (flightValue) {
    pushLine("Speed", `Fly ${flightValue} ft`);
  }

  return lines;
}

function extractRightColumnNotesFromCard(card: PdfPageCard) {
  return extractRightColumnNotesFromText(card.title, card.detail || card.summary || "", card.tags);
}

export function getPassivePdfNoteTagsFromText(title: string, detail?: string) {
  return extractRightColumnNotesFromText(title, detail || "")
    .map((line) => `pdf-note:${line.title.toLowerCase().replace(/\s+/g, "-")}:${line.value}`);
}

function compactTraitSummary(card: PdfPageCard) {
  const cleaned = stripHtml(card.summary || card.detail || "")
    .replace(/\b(?:d6|d8|d10|d12)\s+Damage Type\s+Breath Weapon\b/gi, "")
    .replace(/\bPrerequisite:\s*[^.]+\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const activeSentence = cleaned
    .split(/(?<=[.!?])\s+/)
    .find((sentence) => /\b(action|bonus action|reaction|cast|use|regain|saving throw|advantage|resistance|immune|once|rest|damage|speed)\b/i.test(sentence));
  const summary = activeSentence || cleaned;

  if (!summary) {
    return "See full feature text.";
  }
  return summary.length > 118 ? `${summary.slice(0, 115).trim()}...` : summary;
}

function isNoteOnlyTrait(card: PdfPageCard, notes: PdfRightColumnNoteLine[]) {
  if (!notes.length) {
    return false;
  }

  const body = stripHtml(card.detail || card.summary || "").toLowerCase();
  const fullText = `${card.title} ${body}`;

  if (/^(darkvision|damage resistance|damage vulnerability|damage immunity|dwarven resilience|hellish resistance)$/i.test(card.title)) {
    return true;
  }
  if (/\b(fey ancestry|trance|breath weapon|draconic ancestry|lucky|brave|nimbleness)\b/i.test(fullText)) {
    return false;
  }
  if (/proficienc|language|weapon training|tool/i.test(fullText)) {
    return true;
  }
  if (body.length <= 260 && /\b(darkvision|resistance|immune|vulnerable|speed is increased|flying speed|don'?t need to sleep|advantage .* poisoned)\b/.test(body)) {
    return !/\b(action|bonus action|reaction|attack|cast|spell|damage roll|saving throw dc|once per|short rest|long rest)\b/.test(body) || /poisoned/.test(body);
  }

  return /darkvision|resistance/.test(card.title.toLowerCase());
}

function toCompactTrait(card: PdfPageCard): PdfRightColumnCompactTrait {
  return {
    id: `r3-trait-${card.id}`,
    title: card.title,
    summary: compactTraitSummary(card),
    sourceCardId: card.id,
    priority: card.priority,
  };
}

function buildRightColumnComposition(railCards: PdfPageCard[], featureCards: PdfPageCard[]): PdfFrontPageComposition["rightColumn"] {
  const noteCards = uniqueById([
    ...railCards.filter((card) => card.kind === "condition" || card.kind === "sense"),
    ...featureCards.filter((card) => card.kind !== "proficiency" && card.kind !== "language"),
  ]);
  const traitCards = railCards.filter((card) => card.kind === "trait" && (cardHasGroup(card, "race") || cardHasGroup(card, "subrace")));
  const notes: PdfRightColumnNoteLine[] = [];
  const noteSeen = new Set<string>();

  noteCards.forEach((card) => {
    extractRightColumnNotesFromCard(card).forEach((line) => {
      pushRightColumnNote(notes, noteSeen, line.title, line.value);
    });
  });

  const racialCards: PdfRightColumnCompactTrait[] = [];
  const subracialCards: PdfRightColumnCompactTrait[] = [];
  traitCards.forEach((card) => {
    const cardNotes = extractRightColumnNotesFromCard(card);
    if (isNoteOnlyTrait(card, cardNotes)) {
      return;
    }

    if (cardHasGroup(card, "subrace")) {
      subracialCards.push(toCompactTrait(card));
      return;
    }
    racialCards.push(toCompactTrait(card));
  });

  const maxNotes = 8;
  const maxTraitCards = 5;
  const orderedRacialCards = racialCards.sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title));
  const orderedSubracialCards = subracialCards.sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title));
  const racialVisibleCount = orderedSubracialCards.length ? 2 : maxTraitCards;
  const visibleRacialCards = orderedRacialCards.slice(0, racialVisibleCount);
  const visibleSubracialCards = orderedSubracialCards.slice(0, maxTraitCards - visibleRacialCards.length);
  const visibleTraitIds = new Set([...visibleRacialCards, ...visibleSubracialCards].map((card) => card.sourceCardId));
  const overflow = traitCards.filter((card) => {
    if (isNoteOnlyTrait(card, extractRightColumnNotesFromCard(card))) {
      return false;
    }
    return !visibleTraitIds.has(card.id);
  });

  return {
    sensesAndConditions: notes.slice(0, maxNotes),
    racialCards: visibleRacialCards,
    subracialCards: visibleSubracialCards,
    overflow: uniqueById(overflow),
  };
}

function normalizeAbilityRow(row: PdfAbilityScoreRow): PdfAbilityScoreRow {
  return {
    ...row,
    label: normalizeText(row.label),
    score: Number.isFinite(row.score) ? Math.floor(row.score) : 10,
    modifier: Number.isFinite(row.modifier) ? Math.floor(row.modifier) : 0,
    saveBonus: Number.isFinite(row.saveBonus) ? Math.floor(row.saveBonus) : 0,
    saveProficient: Boolean(row.saveProficient),
  };
}

function normalizeSkillRow(row: PdfSkillRow): PdfSkillRow {
  return {
    ...row,
    label: normalizeText(row.label),
    ability: normalizeText(row.ability),
    total: Number.isFinite(row.total) ? Math.floor(row.total) : 0,
    proficient: Boolean(row.proficient),
    expertise: Boolean(row.expertise),
  };
}

function normalizeAttackRow(row: PdfAttackRow): PdfAttackRow {
  return {
    ...row,
    name: normalizeText(row.name),
    hit: normalizeText(row.hit),
    damage: normalizeText(row.damage),
    type: row.type ? normalizeText(row.type) : undefined,
    properties: row.properties ? normalizeText(row.properties) : undefined,
  };
}

function normalizeProficiencyGroups(groups?: PdfProficiencyGroups): PdfProficiencyGroups {
  return {
    weapons: uniqueStrings((groups?.weapons ?? []).map(normalizeText).filter(Boolean)),
    armor: uniqueStrings((groups?.armor ?? []).map(normalizeText).filter(Boolean)),
    tools: uniqueStrings((groups?.tools ?? []).map(normalizeText).filter(Boolean)),
    vehicles: uniqueStrings((groups?.vehicles ?? []).map(normalizeText).filter(Boolean)),
    languages: uniqueStrings((groups?.languages ?? []).map(normalizeText).filter(Boolean)),
  };
}

function packCards(cards: PdfPageCard[], capacity: number) {
  return {
    packed: cards.slice(0, capacity),
    overflow: cards.slice(capacity),
  };
}

function buildSection(id: string, title: string, cards: PdfPageCard[], description?: string): PdfPageSection | null {
  if (!cards.length) {
    return null;
  }

  return {
    id,
    title,
    cards,
    description,
  };
}

function buildPage(kind: PdfPageKind, number: number, title: string, sections: Array<PdfPageSection | null>, notes: string[] = []): PdfPagePlan {
  return {
    number,
    kind,
    title,
    sections: sections.filter((section): section is PdfPageSection => Boolean(section)),
    notes,
  };
}

function buildCombatHub(source: PdfResolveSource): PdfCombatHub {
  const spellSlots = source.spellSlots;
  const spellList = source.spellList ?? [];

  // Weapon rows: only equipped weapons, not spells or features
  const weaponRows = (source.attackRows ?? []).filter((row) => {
    const t = (row.type ?? "").toLowerCase();
    return t !== "spell" && t !== "feature";
  });

  if (!spellSlots || spellSlots.maxLevel === 0) {
    // Non-spellcaster: full-width weapon column
    return {
      hasSpells: false,
      weaponRows,
    };
  }

  // Build spells by level
  const spellsByLevel: { level: number; spells: PdfSpellListEntry[] }[] = [];
  for (let lvl = 1; lvl <= spellSlots.maxLevel; lvl++) {
    spellsByLevel.push({ level: lvl, spells: [] });
  }

  const cantrips: PdfSpellListEntry[] = [];

  for (const spell of spellList) {
    if (spell.level === 0) {
      cantrips.push(spell);
    } else if (spell.level <= spellSlots.maxLevel) {
      const entry = spellsByLevel.find((e) => e.level === spell.level);
      if (entry) {
        entry.spells.push(spell);
      }
    }
  }

  const spellColumn: PdfCombatHubSpellColumn = {
    cantrips,
    slots: spellSlots,
    spellsByLevel,
  };

  return {
    hasSpells: true,
    weaponRows,
    spellColumn,
  };
}

export function buildFrontPageComposition(source: PdfResolveSource): PdfFrontPageComposition {
  const normalizedStats = uniqueById(source.stats.map((stat) => ({
    ...stat,
    label: normalizeText(stat.label),
    value: normalizeText(stat.value),
    meta: stat.meta ? normalizeText(stat.meta) : undefined,
  })));

  const normalizedAbilityRows = uniqueById((source.abilityRows ?? []).map(normalizeAbilityRow)).sort((left, right) => left.label.localeCompare(right.label));
  const normalizedSkillRows = uniqueById((source.skillRows ?? []).map(normalizeSkillRow)).sort((left, right) => left.label.localeCompare(right.label));
  const normalizedAttackRows = uniqueById((source.attackRows ?? []).map(normalizeAttackRow));
  const normalizedProficiencyGroups = normalizeProficiencyGroups(source.proficiencyGroups);

  const featureCards = uniqueById((source.featureCards ?? []).map(normalizeCard)).sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.title.localeCompare(right.title);
  });

  const railCards = uniqueById([
    ...featureCards.filter(
      (card) =>
        card.pageHint === "front-rail" ||
        card.kind === "trait" ||
        card.kind === "condition" ||
        card.kind === "sense" ||
        card.kind === "proficiency" ||
        card.kind === "language",
    ),
  ]).sort((left, right) => left.priority - right.priority);
  const rightColumn = buildRightColumnComposition(railCards, featureCards);

  const deckOnly = featureCards.filter(
    (card) =>
      card.pageHint !== "front-rail" &&
      card.contentKind !== "appendix" &&
      card.kind !== "trait" &&
      card.kind !== "condition" &&
      card.kind !== "sense" &&
      card.kind !== "proficiency" &&
      card.kind !== "language",
  );
  const packed = packCards(deckOnly, FRONT_PAGE_DECK_CAPACITY);

  const combatHub = buildCombatHub(source);

  return {
    stats: normalizedStats,
    abilityRows: normalizedAbilityRows,
    skillRows: normalizedSkillRows,
    attackRows: normalizedAttackRows,
    proficiencyGroups: normalizedProficiencyGroups,
    deck: packed.packed,
    deckOverflow: packed.overflow,
    railCards,
    rightColumn,
    notes: uniqueStrings([
      ...(source.notes ?? []),
      "Front page is split between a numeric/stat zone and a generated feature-card deck.",
    ]),
    capacity: FRONT_PAGE_DECK_CAPACITY,
    combatHub,
  };
}

function buildPageCards(cards: PdfPageCard[], capacity: number) {
  const normalized = uniqueById(cards.map(normalizeCard)).sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.title.localeCompare(right.title);
  });
  const chunks: PdfPageCard[][] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    chunks.push(normalized.slice(cursor, cursor + capacity));
    cursor += capacity;
  }

  return chunks;
}

export function resolvePdfCharacter(source: PdfResolveSource): ResolvedPdfCharacter {
  const featureCards = uniqueById((source.featureCards ?? []).map(normalizeCard));
  const companionCards = uniqueById((source.companionCards ?? []).map(normalizeCard));
  const inventoryCards = uniqueById((source.inventoryCards ?? []).map(normalizeCard));
  const spellCards = uniqueById((source.spellCards ?? []).map(normalizeCard));
  const backstoryCards = uniqueById([
    ...(source.backstoryCards ?? []).map(normalizeCard),
    ...backstoryToCards(source.backstory),
  ]);
  const appendixEntries = uniqueById([
    ...(source.appendixEntries ?? []),
    ...featureCards.filter((card) => card.contentKind === "appendix").map(toPdfAppendixEntryFromCard),
    ...inventoryCards.filter((card) => card.contentKind === "appendix").map(toPdfAppendixEntryFromCard),
    ...spellCards.filter((card) => card.contentKind === "appendix").map(toPdfAppendixEntryFromCard),
  ]);

  const frontPage = buildFrontPageComposition({
    ...source,
    featureCards,
  });

  const overflowAppendixEntries = [
    ...frontPage.deckOverflow,
    ...frontPage.rightColumn.overflow,
  ].map(toPdfAppendixEntryFromCard);
  const allAppendixEntries = uniqueById([...appendixEntries, ...overflowAppendixEntries]);

  const resolved: ResolvedPdfCharacter = {
    id: source.draft.id,
    name: normalizeText(source.draft.name || "Unnamed character"),
    playerName: normalizeText(source.draft.playerName || ""),
    level: Math.max(1, Math.floor(source.draft.level || 1)),
    raceLabel: normalizeText(source.identity?.raceLabel || source.draft.raceId || ""),
    subraceLabel: normalizeText(source.identity?.subraceLabel || source.draft.subraceId || ""),
    classLabel:
      normalizeText(source.identity?.classLabel || "") ||
      uniqueStrings(source.draft.classEntries.map((entry) => entry.classId).filter(Boolean)).join(" / "),
    subclassLabel: normalizeText(source.identity?.subclassLabel || ""),
    backgroundLabel: normalizeText(source.identity?.backgroundLabel || source.draft.backgroundId || ""),
    alignment: normalizeText((source.backstory ?? source.draft.backstory).alignment || ""),
    deity: normalizeText((source.backstory ?? source.draft.backstory).deity || ""),
    stats: frontPage.stats,
    frontPage,
    companionCards,
    inventoryCards,
    spellCards,
    backstoryCards,
    appendixEntries: allAppendixEntries,
    notes: uniqueStrings(source.notes ?? []),
    currency: source.currency,
    backstory: source.backstory ?? source.draft.backstory,
    source: source.draft,
    pagePlan: [],
  };

  return {
    ...resolved,
    pagePlan: buildPdfPagePlan(resolved),
  };
}

export function buildPdfPagePlan(character: ResolvedPdfCharacter): PdfPagePlan[] {
  const pages: PdfPagePlan[] = [];
  let pageNumber = 1;
  const backstorySourceCards = character.backstoryCards.length ? character.backstoryCards : backstoryToCards(character.backstory);
  const statsCards = character.frontPage.stats.map(statBlockToCard);

  pages.push(
    buildPage("front", pageNumber, "Front Page", [
      buildSection("front-stats", "Numbers and stats", statsCards, "Primary numbers, resources, and derived combat values."),
      buildSection("front-deck", "Features and traits", character.frontPage.deck, "Primary feature cards for the first page."),
      buildSection("front-rail", "Conditions, senses, and other front-page references", character.frontPage.railCards, "Compact cards that replace placeholder whitespace."),
    ], character.frontPage.notes),
  );

  if (character.companionCards.length) {
    pageNumber += 1;
    pages.push(
      buildPage("companion", pageNumber, "Companion", buildPageCards(character.companionCards, INVENTORY_PAGE_CAPACITY).map((cards, index) =>
        buildSection(`companion-${index + 1}`, "Companion cards", cards, "Companion traits, actions, and reactions."),
      ), ["Companion page appears before inventory when a companion exists."]),
    );
  }

  if (character.inventoryCards.length) {
    pageNumber += 1;
    pages.push(
      buildPage("inventory", pageNumber, "Inventory", buildPageCards(character.inventoryCards, INVENTORY_PAGE_CAPACITY).map((cards, index) =>
        buildSection(`inventory-${index + 1}`, "Inventory cards", cards, "Gear, attunement, notes, and item details."),
      ), ["Inventory follows companion when present."]),
    );
  }

  if (character.spellCards.length) {
    pageNumber += 1;
    pages.push(
      buildPage("spells", pageNumber, "Spell List", buildPageCards(character.spellCards, SPELL_PAGE_CAPACITY).map((cards, index) =>
        buildSection(`spells-${index + 1}`, "Spell cards", cards, "Prepared, known, or otherwise selected spells only."),
      ), ["Spell page is shown only when the character has relevant spellcasting content."]),
    );
  }

  if (character.backstoryCards.length || character.backstory?.backstory || character.backstory?.personalityTraits) {
    pageNumber += 1;
    const cards = buildPageCards(backstorySourceCards, INVENTORY_PAGE_CAPACITY)
      .map((cards, index) =>
        buildSection(`backstory-${index + 1}`, "Backstory cards", cards, "Personality, ideals, bonds, flaws, and other narrative content."),
      )
      .filter((section): section is PdfPageSection => Boolean(section));
    pages.push(
      buildPage("backstory", pageNumber, "Backstory", cards, ["Narrative content comes after the mechanical pages."]),
    );
  }

  if (character.appendixEntries.length) {
    const appendixChunks = buildPageCards(
      character.appendixEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        kind: "note",
        contentKind: "appendix",
        summary: sentencePreview(entry.body),
        detail: entry.body,
        sourceLabel: entry.sourceLabel,
        tags: entry.tags,
        priority: 100,
        pageHint: "appendix",
        widthHint: "wide",
      })),
      APPENDIX_PAGE_CAPACITY,
    );

    appendixChunks.forEach((cards, index) => {
      pageNumber += 1;
      pages.push(
        buildPage(
          "appendix",
          pageNumber,
          index === 0 ? "Appendix" : `Appendix ${index + 1}`,
          [buildSection(`appendix-${index + 1}`, "Verbose details", cards, "Long-form detail pages for spells, items, features, and similar content.")],
          ["Appendix pages hold overflow and long-form detail content."],
        ),
      );
    });
  }

  return pages;
}

export function mapPdfSvgUsage() {
  return {
    ...PDF_SVG_COMPONENT_MANIFEST,
  } as const;
}
