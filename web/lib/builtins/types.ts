export type BuiltInElementType =
  | "Ability Score Improvement"
  | "Background"
  | "Background Feature"
  | "Background Variant"
  | "Class"
  | "Class Feature"
  | "Companion"
  | "Companion Trait"
  | "Companion Action"
  | "Companion Reaction"
  | "Feat"
  | "Feat Feature"
  | "Language"
  | "Proficiency"
  | "Spell"
  | "Archetype"
  | "Archetype Feature"
  | "Race"
  | "Sub Race"
  | "Racial Trait"
  | "Race Variant";

export type BuiltInSelectChoice = {
  id: string;
  value: string;
};

export type BuiltInRule =
  | {
      kind: "grant";
      type: string;
      id: string;
      requirements?: string;
      level?: number;
      prepared?: boolean;
      equipped?: boolean;
      alt?: string;
    }
  | {
      kind: "select";
      type: string;
      name: string;
      supports?: string;
      choices?: BuiltInSelectChoice[];
      requirements?: string;
      number?: number;
      optional?: boolean;
      level?: number;
      prepared?: boolean;
      equipped?: boolean;
      alt?: string;
    }
  | {
      kind: "stat";
      name: string;
      value: string;
      bonus?: string;
      requirements?: string;
      level?: number;
      alt?: string;
    };

export type BuiltInSetter = {
  name: string;
  value: string;
  type?: string;
  modifier?: string;
  alt?: string;
};

export type BuiltInSheetDescription = {
  text: string;
  html?: string;
  level?: number;
  usage?: string;
  alt?: string;
};

export type BuiltInSheet = {
  display?: boolean;
  action?: string;
  usage?: string;
  alt?: string;
  descriptions: BuiltInSheetDescription[];
};

export type BuiltInMulticlass = {
  requirements?: string;
  requirementsDescription?: string;
  rules?: BuiltInRule[];
  setters?: BuiltInSetter[];
};

export type BuiltInSpellcasting = {
  ability?: string;
  list?: string;
  name?: string;
  rules?: BuiltInRule[];
  setters?: BuiltInSetter[];
};

export type BuiltInElement = {
  id: string;
  type: BuiltInElementType;
  name: string;
  source: string;
  source_url: string;
  catalogOrigin?: "built-in" | "imported";
  supports: string[];
  description: string;
  descriptionHtml?: string;
  prerequisite?: string;
  requirements?: string;
  rules: BuiltInRule[];
  setters: BuiltInSetter[];
  sheet?: BuiltInSheet;
  multiclass?: BuiltInMulticlass;
  spellcasting?: BuiltInSpellcasting;
};
