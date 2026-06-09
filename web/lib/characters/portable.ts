import {
  CHARACTER_DRAFT_SCHEMA_VERSION,
  normalizeCharacterDraft,
  type CharacterDraft,
} from "@/lib/characters/types";

export const ARCANUM_CHARACTER_FORMAT = "arcanum.character";
export const MAX_CHARACTER_IMPORT_BYTES = 2 * 1024 * 1024;

export type PortableCharacterEnvelope = {
  format: typeof ARCANUM_CHARACTER_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  character: CharacterDraft;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSupportedPortraitUrl(value: string) {
  if (!value.trim()) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function createPortableCharacter(draft: CharacterDraft): PortableCharacterEnvelope {
  return {
    format: ARCANUM_CHARACTER_FORMAT,
    schemaVersion: CHARACTER_DRAFT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    character: normalizeCharacterDraft(draft),
  };
}

export function downloadPortableCharacter(draft: CharacterDraft) {
  const envelope = createPortableCharacter(draft);
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = (draft.name || "unnamed")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  link.href = url;
  link.download = `${safeName || "unnamed"}-arcanum-build.json`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function parsePortableCharacter(value: unknown): CharacterDraft {
  if (!isRecord(value)) {
    throw new Error("This file does not contain an Arcanum character.");
  }

  const rawCharacter =
    value.format === ARCANUM_CHARACTER_FORMAT && isRecord(value.character)
      ? value.character
      : value;
  const schemaVersion =
    value.format === ARCANUM_CHARACTER_FORMAT
      ? Number(value.schemaVersion)
      : Number(rawCharacter.schemaVersion ?? 1);

  if (!Number.isFinite(schemaVersion) || schemaVersion > CHARACTER_DRAFT_SCHEMA_VERSION) {
    throw new Error("This character was created by a newer, unsupported Arcanum version.");
  }

  if (typeof rawCharacter.id !== "string" || !Array.isArray(rawCharacter.classEntries)) {
    throw new Error("The character payload is missing required builder data.");
  }

  const normalized = normalizeCharacterDraft(rawCharacter as CharacterDraft);
  if (
    !isSupportedPortraitUrl(normalized.characterPortraitUrl) ||
    !isSupportedPortraitUrl(normalized.companionPortraitUrl)
  ) {
    throw new Error("Portrait URLs must use http or https.");
  }

  const now = new Date().toISOString();
  return normalizeCharacterDraft({
    ...normalized,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  });
}

export async function importPortableCharacterFile(file: File) {
  if (file.size > MAX_CHARACTER_IMPORT_BYTES) {
    throw new Error("Character files must be smaller than 2 MB.");
  }

  if (file.type && file.type !== "application/json" && !file.name.toLowerCase().endsWith(".json")) {
    throw new Error("Choose an Arcanum JSON character file.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  return parsePortableCharacter(parsed);
}
