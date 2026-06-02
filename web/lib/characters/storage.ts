import { normalizeCharacterDraft, type CharacterDraft } from "@/lib/characters/types";

const STORAGE_KEY = "arcanum.characterDrafts";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function listCharacterDrafts(): CharacterDraft[] {
  if (!canUseStorage()) {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CharacterDraft[];
    const drafts: CharacterDraft[] = [];
    for (const draft of parsed) {
      try {
        drafts.push(normalizeCharacterDraft(draft));
      } catch (err) {
        // Skip malformed draft, log for debugging
        console.warn("[storage] skipping invalid draft:", draft.id, err);
      }
    }
    return drafts.sort((a, b) => {
      const aTime = a?.updatedAt ?? "";
      const bTime = b?.updatedAt ?? "";
      return bTime.localeCompare(aTime);
    });
  } catch {
    return [];
  }
}

export function getCharacterDraft(id: string) {
  return listCharacterDrafts().find((draft) => draft.id === id) ?? null;
}

export function saveCharacterDraft(draft: CharacterDraft) {
  if (!canUseStorage()) {
    return;
  }

  const drafts = listCharacterDrafts();
  const nextDraft = {
    ...normalizeCharacterDraft(draft),
    updatedAt: new Date().toISOString(),
  };
  const index = drafts.findIndex((entry) => entry.id === nextDraft.id);

  if (index >= 0) {
    drafts[index] = nextDraft;
  } else {
    drafts.unshift(nextDraft);
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function deleteCharacterDraft(id: string) {
  if (!canUseStorage()) {
    return;
  }

  const drafts = listCharacterDrafts().filter((draft) => draft.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function mergeCharacterDrafts(
  localDrafts: CharacterDraft[],
  remoteDrafts: CharacterDraft[],
) {
  const merged = new Map<string, CharacterDraft>();

  [...localDrafts, ...remoteDrafts].forEach((draft) => {
    const existing = merged.get(draft.id);

    if (!existing || draft.updatedAt > existing.updatedAt) {
      merged.set(draft.id, draft);
    }
  });

  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
