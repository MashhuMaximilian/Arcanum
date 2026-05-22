import type { BuiltInElement } from "@/lib/builtins/types";

function markBuiltIn(elements: readonly BuiltInElement[]): BuiltInElement[] {
  return elements.map((element) => ({
    ...element,
    catalogOrigin: "built-in" as const,
  }));
}

export function getBuiltInSrdCompanions(): BuiltInElement[] {
  return markBuiltIn(BUILT_IN_SRD_COMPANION_ELEMENTS);
}

export function getBuiltInSrdCompanionSubElements(): BuiltInElement[] {
  return markBuiltIn(BUILT_IN_SRD_COMPANION_SUB_ELEMENTS);
}

/**
 * SRD companion beasts for Ranger Beast Master and similar companion select rules.
 * These are the canonical beasts from PHB Appendix D that fit the rules constraints:
 * - Type: Beast
 * - Size: no larger than Medium
 * - Challenge Rating: 1/4 or lower (or 0 for the iconic scouts)
 *
 * Selected by dnd-expert to cover all meaningful playstyle archetypes.
 */
export const BUILT_IN_SRD_COMPANION_ELEMENTS: readonly BuiltInElement[] = [
  // ─── Scout / Flyer ─────────────────────────────────────────────────────────
  {
    id: "ID_WOTC_PHB_COMPANION_HAWK",
    type: "Companion",
    name: "Hawk",
    source: "Player's Handbook",
    source_url:
      "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "A loyal bird of prey with razor-sharp talons and keen eyesight. Hawks excel as aerial scouts, ignoring opportunity attacks and providing Perception advantage using sight.",
    rules: [
      { kind: "stat", name: "companion:ac", value: "13" },
      { kind: "stat", name: "companion:hp:max", value: "1", bonus: "base" },
      { kind: "stat", name: "companion:speed", value: "10", bonus: "base" },
      { kind: "stat", name: "companion:speed:fly", value: "60", bonus: "base" },
      { kind: "stat", name: "companion:perception:proficiency", value: "companion:proficiency", bonus: "base" },
    ],
    setters: [
      { name: "type", value: "Beast" },
      { name: "size", value: "Tiny" },
      { name: "alignment", value: "unaligned" },
      { name: "challenge", value: "0" },
      { name: "strength", value: "5" },
      { name: "dexterity", value: "16" },
      { name: "constitution", value: "8" },
      { name: "intelligence", value: "2" },
      { name: "wisdom", value: "14" },
      { name: "charisma", value: "6" },
      { name: "ac", value: "13" },
      { name: "hp", value: "1 (1d4-1)" },
      { name: "speed", value: "10 ft., fly 60 ft." },
      { name: "languages", value: "—" },
      { name: "skills", value: "Perception +4" },
      { name: "traits", value: "ID_WOTC_PHB_COMPANION_TRAIT_HAWK_KEEN_SIGHT" },
      { name: "actions", value: "ID_WOTC_PHB_COMPANION_ACTION_HAWK_TALONS" },
    ],
  },

  // ─── Guardian / Tracker ──────────────────────────────────────────────────────
  {
    id: "ID_WOTC_PHB_COMPANION_MASTIFF",
    type: "Companion",
    name: "Mastiff",
    source: "Player's Handbook",
    source_url:
      "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "A stalwart guardian dog with keen senses. Mastiffs have Darkvision, reliable Perception, and a strong bite — making them excellent watchdogs and trackers.",
    rules: [
      { kind: "stat", name: "companion:ac", value: "12" },
      { kind: "stat", name: "companion:hp:max", value: "5", bonus: "base" },
      { kind: "stat", name: "companion:speed", value: "40", bonus: "base" },
      { kind: "stat", name: "companion:perception:proficiency", value: "companion:proficiency", bonus: "base" },
    ],
    setters: [
      { name: "type", value: "Beast" },
      { name: "size", value: "Medium" },
      { name: "alignment", value: "unaligned" },
      { name: "challenge", value: "1/8" },
      { name: "strength", value: "13" },
      { name: "dexterity", value: "14" },
      { name: "constitution", value: "12" },
      { name: "intelligence", value: "3" },
      { name: "wisdom", value: "12" },
      { name: "charisma", value: "7" },
      { name: "ac", value: "12" },
      { name: "hp", value: "5 (1d8+1)" },
      { name: "speed", value: "40 ft." },
      { name: "languages", value: "—" },
      { name: "skills", value: "Perception +3" },
      { name: "traits", value: "ID_WOTC_PHB_COMPANION_TRAIT_MASTIFF_KEEN_HEARING_AND_SMELL" },
      { name: "actions", value: "ID_WOTC_PHB_COMPANION_ACTION_MASTIFF_BITE" },
    ],
  },

  // ─── Dungeon Scout ──────────────────────────────────────────────────────────
  {
    id: "ID_WOTC_PHB_COMPANION_GIANT_RAT",
    type: "Companion",
    name: "Giant Rat",
    source: "Player's Handbook",
    source_url:
      "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "A trained giant rat that excels at dungeon scouting. Darkvision, Keen Smell, and a small size let it navigate tight spaces and detect dangers before the party does.",
    rules: [
      { kind: "stat", name: "companion:ac", value: "13" },
      { kind: "stat", name: "companion:hp:max", value: "3", bonus: "base" },
      { kind: "stat", name: "companion:speed", value: "30", bonus: "base" },
      { kind: "stat", name: "companion:perception:proficiency", value: "companion:proficiency", bonus: "base" },
    ],
    setters: [
      { name: "type", value: "Beast" },
      { name: "size", value: "Small" },
      { name: "alignment", value: "unaligned" },
      { name: "challenge", value: "1/8" },
      { name: "strength", value: "7" },
      { name: "dexterity", value: "15" },
      { name: "constitution", value: "11" },
      { name: "intelligence", value: "2" },
      { name: "wisdom", value: "10" },
      { name: "charisma", value: "4" },
      { name: "ac", value: "13" },
      { name: "hp", value: "3 (1d8)" },
      { name: "speed", value: "30 ft." },
      { name: "languages", value: "—" },
      { name: "skills", value: "Perception +3, Stealth +4" },
      { name: "traits", value: "ID_WOTC_PHB_COMPANION_TRAIT_GIANT_RAT_KEEN_SMELL" },
      { name: "actions", value: "ID_WOTC_PHB_COMPANION_ACTION_GIANT_RAT_BITE" },
    ],
  },

  // ─── Melee Striker — Pounce ─────────────────────────────────────────────────
  {
    id: "ID_WOTC_PHB_COMPANION_PANTHER",
    type: "Companion",
    name: "Panther",
    source: "Player's Handbook",
    source_url:
      "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "An agile big cat with a devastating Pounce. It can move 20 feet and make an automatic melee attack that knocks the target prone — high damage potential and excellent stealth.",
    rules: [
      { kind: "stat", name: "companion:ac", value: "12" },
      { kind: "stat", name: "companion:hp:max", value: "13", bonus: "base" },
      { kind: "stat", name: "companion:speed", value: "50", bonus: "base" },
      { kind: "stat", name: "companion:speed:climb", value: "40", bonus: "base" },
      { kind: "stat", name: "companion:perception:proficiency", value: "companion:proficiency", bonus: "base" },
      { kind: "stat", name: "companion:stealth:proficiency", value: "companion:proficiency", bonus: "base" },
      { kind: "stat", name: "companion:stealth:proficiency", value: "companion:proficiency", bonus: "double" },
    ],
    setters: [
      { name: "type", value: "Beast" },
      { name: "size", value: "Medium" },
      { name: "alignment", value: "unaligned" },
      { name: "challenge", value: "1/4" },
      { name: "strength", value: "14" },
      { name: "dexterity", value: "15" },
      { name: "constitution", value: "10" },
      { name: "intelligence", value: "3" },
      { name: "wisdom", value: "14" },
      { name: "charisma", value: "7" },
      { name: "ac", value: "12" },
      { name: "hp", value: "13 (3d8)" },
      { name: "speed", value: "50 ft., climb 40 ft." },
      { name: "languages", value: "—" },
      { name: "skills", value: "Perception +4, Stealth +6" },
      { name: "traits", value: "ID_WOTC_PHB_COMPANION_TRAIT_PANTHER_KEEN_SMELL,ID_WOTC_PHB_COMPANION_TRAIT_PANTHER_POUNCE" },
      { name: "actions", value: "ID_WOTC_PHB_COMPANION_ACTION_PANTHER_BITE,ID_WOTC_PHB_COMPANION_ACTION_PANTHER_CLAW" },
    ],
  },

  // ─── Melee Striker — Pack Tactics ────────────────────────────────────────────
  {
    id: "ID_WOTC_PHB_COMPANION_WOLF",
    type: "Companion",
    name: "Wolf",
    source: "Player's Handbook",
    source_url:
      "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "A pack hunter with Pack Tactics. When an ally is within 5 feet of the target, the wolf attacks with advantage — giving the whole party a tactical edge. Its bite DC causes prone.",
    rules: [
      { kind: "stat", name: "companion:ac", value: "13" },
      { kind: "stat", name: "companion:hp:max", value: "11", bonus: "base" },
      { kind: "stat", name: "companion:speed", value: "40", bonus: "base" },
      { kind: "stat", name: "companion:perception:proficiency", value: "companion:proficiency", bonus: "base" },
      { kind: "stat", name: "companion:stealth:proficiency", value: "companion:proficiency", bonus: "base" },
    ],
    setters: [
      { name: "type", value: "Beast" },
      { name: "size", value: "Medium" },
      { name: "alignment", value: "unaligned" },
      { name: "challenge", value: "1/4" },
      { name: "strength", value: "12" },
      { name: "dexterity", value: "15" },
      { name: "constitution", value: "12" },
      { name: "intelligence", value: "3" },
      { name: "wisdom", value: "12" },
      { name: "charisma", value: "6" },
      { name: "ac", value: "13" },
      { name: "hp", value: "11 (2d8+2)" },
      { name: "speed", value: "40 ft." },
      { name: "languages", value: "—" },
      { name: "skills", value: "Perception +3, Stealth +4" },
      { name: "traits", value: "ID_WOTC_PHB_COMPANION_TRAIT_WOLF_KEEN_HEARING_AND_SMELL,ID_WOTC_PHB_COMPANION_TRAIT_WOLF_PACK_TACTICS" },
      { name: "actions", value: "ID_WOTC_PHB_COMPANION_ACTION_WOLF_BITE" },
    ],
  },

  // ─── Tank / Grappler — Multiattack ───────────────────────────────────────────
  {
    id: "ID_WOTC_PHB_COMPANION_APE",
    type: "Companion",
    name: "Ape",
    source: "Player's Handbook",
    source_url:
      "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "A powerful ape with Multiattack (two fist attacks) and strong Athletics. Excellent for grappling, climbing vertical surfaces, and soaking damage. Highest HP among the roster.",
    rules: [
      { kind: "stat", name: "companion:ac", value: "12" },
      { kind: "stat", name: "companion:hp:max", value: "19", bonus: "base" },
      { kind: "stat", name: "companion:speed", value: "30", bonus: "base" },
      { kind: "stat", name: "companion:speed:climb", value: "30", bonus: "base" },
      { kind: "stat", name: "companion:athletics:proficiency", value: "companion:proficiency", bonus: "base" },
      { kind: "stat", name: "companion:perception:proficiency", value: "companion:proficiency", bonus: "base" },
    ],
    setters: [
      { name: "type", value: "Beast" },
      { name: "size", value: "Medium" },
      { name: "alignment", value: "unaligned" },
      { name: "challenge", value: "1/2" },
      { name: "strength", value: "16" },
      { name: "dexterity", value: "14" },
      { name: "constitution", value: "14" },
      { name: "intelligence", value: "6" },
      { name: "wisdom", value: "12" },
      { name: "charisma", value: "7" },
      { name: "ac", value: "12" },
      { name: "hp", value: "19 (3d8+6)" },
      { name: "speed", value: "30 ft., climb 30 ft." },
      { name: "languages", value: "—" },
      { name: "skills", value: "Athletics +5, Perception +3" },
      { name: "actions", value: "ID_WOTC_PHB_COMPANION_ACTION_APE_MULTIATTACK,ID_WOTC_PHB_COMPANION_ACTION_APE_FIST,ID_WOTC_PHB_COMPANION_ACTION_APE_ROCK" },
    ],
  },

  // ─── Stealth / Dungeon — Spider Climb ────────────────────────────────────────
  {
    id: "ID_WOTC_PHB_COMPANION_GIANT_WOLF_SPIDER",
    type: "Companion",
    name: "Giant Wolf Spider",
    source: "Player's Handbook",
    source_url:
      "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "A spider that climbs walls and ceilings for dungeon scouting. Blindsight, darkvision, Stealth proficiency, and a poisonous bite make it uniquely versatile and terrifying.",
    rules: [
      { kind: "stat", name: "companion:ac", value: "13" },
      { kind: "stat", name: "companion:hp:max", value: "11", bonus: "base" },
      { kind: "stat", name: "companion:speed", value: "40", bonus: "base" },
      { kind: "stat", name: "companion:speed:climb", value: "40", bonus: "base" },
      { kind: "stat", name: "companion:perception:proficiency", value: "companion:proficiency", bonus: "base" },
      { kind: "stat", name: "companion:stealth:proficiency", value: "companion:proficiency", bonus: "base" },
      { kind: "stat", name: "companion:stealth:proficiency", value: "companion:proficiency", bonus: "double" },
    ],
    setters: [
      { name: "type", value: "Beast" },
      { name: "size", value: "Medium" },
      { name: "alignment", value: "unaligned" },
      { name: "challenge", value: "1/4" },
      { name: "strength", value: "12" },
      { name: "dexterity", value: "16" },
      { name: "constitution", value: "13" },
      { name: "intelligence", value: "3" },
      { name: "wisdom", value: "12" },
      { name: "charisma", value: "4" },
      { name: "ac", value: "13" },
      { name: "hp", value: "11 (2d8+2)" },
      { name: "speed", value: "40 ft., climb 40 ft." },
      { name: "senses", value: "blindsight 10 ft., darkvision 60 ft." },
      { name: "languages", value: "—" },
      { name: "skills", value: "Perception +3, Stealth +7" },
      {
        name: "traits",
        value: "ID_WOTC_PHB_COMPANION_TRAIT_GIANT_WOLF_SPIDER_SPIDER_CLIMB,ID_WOTC_PHB_COMPANION_TRAIT_GIANT_WOLF_SPIDER_WEB_SENSE,ID_WOTC_PHB_COMPANION_TRAIT_GIANT_WOLF_SPIDER_WEB_WALKER",
      },
      { name: "actions", value: "ID_WOTC_PHB_COMPANION_ACTION_GIANT_WOLF_SPIDER_BITE" },
    ],
  },

  // ─── Tank — Relentless ──────────────────────────────────────────────────────
  {
    id: "ID_WOTC_PHB_COMPANION_BOAR",
    type: "Companion",
    name: "Boar",
    source: "Player's Handbook",
    source_url:
      "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "A brutally durable boar with the Relentless trait — it rerolls 1s on death saving throws, making it extremely hard to kill. Charge adds extra damage and can knock targets prone.",
    rules: [
      { kind: "stat", name: "companion:ac", value: "11" },
      { kind: "stat", name: "companion:hp:max", value: "11", bonus: "base" },
      { kind: "stat", name: "companion:speed", value: "40", bonus: "base" },
    ],
    setters: [
      { name: "type", value: "Beast" },
      { name: "size", value: "Medium" },
      { name: "alignment", value: "unaligned" },
      { name: "challenge", value: "1/4" },
      { name: "strength", value: "13" },
      { name: "dexterity", value: "11" },
      { name: "constitution", value: "12" },
      { name: "intelligence", value: "2" },
      { name: "wisdom", value: "9" },
      { name: "charisma", value: "5" },
      { name: "ac", value: "11 (natural armor)" },
      { name: "hp", value: "11 (2d8+2)" },
      { name: "speed", value: "40 ft." },
      { name: "languages", value: "—" },
      { name: "traits", value: "ID_WOTC_PHB_COMPANION_TRAIT_BOAR_CHARGE,ID_WOTC_PHB_COMPANION_TRAIT_BOAR_RELENTLESS" },
      { name: "actions", value: "ID_WOTC_PHB_COMPANION_ACTION_BOAR_TUSK" },
    ],
  },

  // ─── Control / Charge ────────────────────────────────────────────────────────
  {
    id: "ID_WOTC_PHB_COMPANION_GOAT",
    type: "Companion",
    name: "Goat",
    source: "Player's Handbook",
    source_url:
      "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "A sturdy goat with a powerful Charge. Moving 20 feet then hitting applies extra damage and forces a DC 10 STR save to avoid being knocked prone. Sure-Footed ignores difficult terrain from non-magical sources.",
    rules: [
      { kind: "stat", name: "companion:ac", value: "10" },
      { kind: "stat", name: "companion:hp:max", value: "4", bonus: "base" },
      { kind: "stat", name: "companion:speed", value: "40", bonus: "base" },
    ],
    setters: [
      { name: "type", value: "Beast" },
      { name: "size", value: "Medium" },
      { name: "alignment", value: "unaligned" },
      { name: "challenge", value: "0" },
      { name: "strength", value: "12" },
      { name: "dexterity", value: "10" },
      { name: "constitution", value: "11" },
      { name: "intelligence", value: "2" },
      { name: "wisdom", value: "10" },
      { name: "charisma", value: "5" },
      { name: "ac", value: "10" },
      { name: "hp", value: "4 (1d8)" },
      { name: "speed", value: "40 ft." },
      { name: "languages", value: "—" },
      { name: "traits", value: "ID_WOTC_PHB_COMPANION_TRAIT_GOAT_CHARGE,ID_WOTC_PHB_COMPANION_TRAIT_GOAT_SURE_FOOTED" },
      { name: "actions", value: "ID_WOTC_PHB_COMPANION_ACTION_GOAT_RAM" },
    ],
  },
];

// ─── Traits ────────────────────────────────────────────────────────────────────

const BUILT_IN_SRD_COMPANION_TRAITS: readonly BuiltInElement[] = [
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_HAWK_KEEN_SIGHT",
    type: "Companion Trait",
    name: "Keen Sight",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "The hawk has advantage on Wisdom (Perception) checks that rely on sight.",
    descriptionHtml:
      "<p>The hawk has advantage on Wisdom (Perception) checks that rely on sight.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_MASTIFF_KEEN_HEARING_AND_SMELL",
    type: "Companion Trait",
    name: "Keen Hearing and Smell",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "The mastiff has advantage on Wisdom (Perception) checks that rely on hearing or smell.",
    descriptionHtml:
      "<p>The mastiff has advantage on Wisdom (Perception) checks that rely on hearing or smell.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_GIANT_RAT_KEEN_SMELL",
    type: "Companion Trait",
    name: "Keen Smell",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "The rat has advantage on Wisdom (Perception) checks that rely on smell.",
    descriptionHtml:
      "<p>The rat has advantage on Wisdom (Perception) checks that rely on smell.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_PANTHER_KEEN_SMELL",
    type: "Companion Trait",
    name: "Keen Smell",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "The panther has advantage on Wisdom (Perception) checks that rely on smell.",
    descriptionHtml:
      "<p>The panther has advantage on Wisdom (Perception) checks that rely on smell.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_PANTHER_POUNCE",
    type: "Companion Trait",
    name: "Pounce",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "If the panther moves at least 20 feet straight toward a creature and then hits it with a claw attack on the same turn, that target must succeed on a DC 12 Strength saving throw or be knocked prone. If the target is prone, the panther can make one bite attack against it as a bonus action.",
    descriptionHtml:
      "<p>If the panther moves at least 20 feet straight toward a creature and then hits it with a claw attack on the same turn, that target must succeed on a DC 12 Strength saving throw or be knocked prone. If the target is prone, the panther can make one bite attack against it as a bonus action.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_WOLF_KEEN_HEARING_AND_SMELL",
    type: "Companion Trait",
    name: "Keen Hearing and Smell",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.",
    descriptionHtml:
      "<p>The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_WOLF_PACK_TACTICS",
    type: "Companion Trait",
    name: "Pack Tactics",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "The wolf has advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 feet of the creature and the ally isn't incapacitated.",
    descriptionHtml:
      "<p>The wolf has advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 feet of the creature and the ally isn't incapacitated.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_GIANT_WOLF_SPIDER_SPIDER_CLIMB",
    type: "Companion Trait",
    name: "Spider Climb",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "The spider can climb difficult surfaces, including upside down on ceilings, without needing to make an ability check.",
    descriptionHtml:
      "<p>The spider can climb difficult surfaces, including upside down on ceilings, without needing to make an ability check.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_GIANT_WOLF_SPIDER_WEB_SENSE",
    type: "Companion Trait",
    name: "Web Sense",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "While in contact with a web, the spider knows the exact location of any other creature in contact with the same web.",
    descriptionHtml:
      "<p>While in contact with a web, the spider knows the exact location of any other creature in contact with the same web.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_GIANT_WOLF_SPIDER_WEB_WALKER",
    type: "Companion Trait",
    name: "Web Walker",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "The spider ignores movement restrictions caused by webbing.",
    descriptionHtml: "<p>The spider ignores movement restrictions caused by webbing.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_BOAR_CHARGE",
    type: "Companion Trait",
    name: "Charge",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "If the boar moves at least 20 feet straight toward a target and then hits it with a tusk attack on the same turn, the target takes an extra 2 (1d4) slashing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.",
    descriptionHtml:
      "<p>If the boar moves at least 20 feet straight toward a target and then hits it with a tusk attack on the same turn, the target takes an extra 2 (1d4) slashing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_BOAR_RELENTLESS",
    type: "Companion Trait",
    name: "Relentless",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "If the boar takes damage that reduces it to 0 hit points, it makes a DC 10 Constitution saving throw. On a success, it drops to 1 hit point instead.",
    descriptionHtml:
      "<p>If the boar takes damage that reduces it to 0 hit points, it makes a DC 10 Constitution saving throw. On a success, it drops to 1 hit point instead.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_GOAT_CHARGE",
    type: "Companion Trait",
    name: "Charge",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "If the goat moves at least 20 feet straight toward a target and then hits it with a ram attack on the same turn, the target takes an extra 2 (1d4) bludgeoning damage. If the target is a creature, it must succeed on a DC 10 Strength saving throw or be knocked prone.",
    descriptionHtml:
      "<p>If the goat moves at least 20 feet straight toward a target and then hits it with a ram attack on the same turn, the target takes an extra 2 (1d4) bludgeoning damage. If the target is a creature, it must succeed on a DC 10 Strength saving throw or be knocked prone.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_TRAIT_GOAT_SURE_FOOTED",
    type: "Companion Trait",
    name: "Sure-Footed",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "The goat has advantage on Strength and Dexterity saving throws against effects that would knock it prone.",
    descriptionHtml:
      "<p>The goat has advantage on Strength and Dexterity saving throws against effects that would knock it prone.</p>",
    rules: [],
    setters: [],
  },
];

// ─── Actions ────────────────────────────────────────────────────────────────────

const BUILT_IN_SRD_COMPANION_ACTIONS: readonly BuiltInElement[] = [
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_HAWK_TALONS",
    type: "Companion Action",
    name: "Talons",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 1 slashing damage.",
    descriptionHtml:
      "<p><em>Melee Weapon Attack:</em> +5 to hit, reach 5 ft., one target. <em>Hit:</em> 1 slashing damage.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_MASTIFF_BITE",
    type: "Companion Action",
    name: "Bite",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d8+2) piercing damage. If the target is a creature, it must succeed on a DC 12 Strength saving throw or be knocked prone.",
    descriptionHtml:
      "<p><em>Melee Weapon Attack:</em> +4 to hit, reach 5 ft., one target. <em>Hit:</em> 5 (1d8+2) piercing damage. If the target is a creature, it must succeed on a DC 12 Strength saving throw or be knocked prone.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_GIANT_RAT_BITE",
    type: "Companion Action",
    name: "Bite",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 4 (1d6+1) piercing damage.",
    descriptionHtml:
      "<p><em>Melee Weapon Attack:</em> +4 to hit, reach 5 ft., one target. <em>Hit:</em> 4 (1d6+1) piercing damage.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_PANTHER_BITE",
    type: "Companion Action",
    name: "Bite",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8+3) piercing damage.",
    descriptionHtml:
      "<p><em>Melee Weapon Attack:</em> +5 to hit, reach 5 ft., one target. <em>Hit:</em> 7 (1d8+3) piercing damage.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_PANTHER_CLAW",
    type: "Companion Action",
    name: "Claw",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) slashing damage.",
    descriptionHtml:
      "<p><em>Melee Weapon Attack:</em> +5 to hit, reach 5 ft., one target. <em>Hit:</em> 5 (1d6+2) slashing damage.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_WOLF_BITE",
    type: "Companion Action",
    name: "Bite",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d8+2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.",
    descriptionHtml:
      "<p><em>Melee Weapon Attack:</em> +4 to hit, reach 5 ft., one target. <em>Hit:</em> 6 (1d8+2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_APE_MULTIATTACK",
    type: "Companion Action",
    name: "Multiattack",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description: "The ape makes two fist attacks.",
    descriptionHtml: "<p>The ape makes two fist attacks.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_APE_FIST",
    type: "Companion Action",
    name: "Fist",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6+3) bludgeoning damage.",
    descriptionHtml:
      "<p><em>Melee Weapon Attack:</em> +5 to hit, reach 5 ft., one target. <em>Hit:</em> 6 (1d6+3) bludgeoning damage.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_APE_ROCK",
    type: "Companion Action",
    name: "Rock",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "Ranged Weapon Attack: +5 to hit, range 25/50 ft., one target. Hit: 6 (1d6+3) bludgeoning damage.",
    descriptionHtml:
      "<p><em>Ranged Weapon Attack:</em> +5 to hit, range 25/50 ft., one target. <em>Hit:</em> 6 (1d6+3) bludgeoning damage.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_GIANT_WOLF_SPIDER_BITE",
    type: "Companion Action",
    name: "Bite",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "Melee Weapon Attack: +5 to hit, reach 5 ft., one creature. Hit: 7 (1d8+3) piercing damage, and the target must make a DC 12 Constitution saving throw, taking 7 (2d6) poison damage on a failed save or half as much damage on a successful one.",
    descriptionHtml:
      "<p><em>Melee Weapon Attack:</em> +5 to hit, reach 5 ft., one creature. <em>Hit:</em> 7 (1d8+3) piercing damage, and the target must make a DC 12 Constitution saving throw, taking 7 (2d6) poison damage on a failed save or half as much damage on a successful one.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_BOAR_TUSK",
    type: "Companion Action",
    name: "Tusk",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 6 (1d8+2) slashing damage.",
    descriptionHtml:
      "<p><em>Melee Weapon Attack:</em> +3 to hit, reach 5 ft., one target. <em>Hit:</em> 6 (1d8+2) slashing damage.</p>",
    rules: [],
    setters: [],
  },
  {
    id: "ID_WOTC_PHB_COMPANION_ACTION_GOAT_RAM",
    type: "Companion Action",
    name: "Ram",
    source: "Player's Handbook",
    source_url: "https://raw.githubusercontent.com/aurorabuilder/elements/master/core/players-handbook/companions.xml",
    supports: [],
    description:
      "Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6+1) bludgeoning damage.",
    descriptionHtml:
      "<p><em>Melee Weapon Attack:</em> +3 to hit, reach 5 ft., one target. <em>Hit:</em> 4 (1d6+1) bludgeoning damage.</p>",
    rules: [],
    setters: [],
  },
];

export const BUILT_IN_SRD_COMPANION_SUB_ELEMENTS: readonly BuiltInElement[] = [
  ...BUILT_IN_SRD_COMPANION_TRAITS,
  ...BUILT_IN_SRD_COMPANION_ACTIONS,
];