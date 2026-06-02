"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeCharacterDraft, type CharacterDraft } from "@/lib/characters/types";

type CharacterRecord = {
  id: string;
  name: string;
  payload: CharacterDraft;
  updated_at: string;
};

async function getAuthedSupabase() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return {
    supabase,
    userId: user.id,
  };
}

export async function listRemoteCharacterDrafts(): Promise<CharacterDraft[]> {
  try {
    const auth = await getAuthedSupabase();

    if (!auth) {
      return [];
    }

    const { supabase } = auth;

    const { data, error } = await supabase
      .from("characters")
      .select("id,name,payload,updated_at")
      .order("updated_at", { ascending: false });

    if (error || !data) {
      console.warn("[repository] listRemoteCharacterDrafts returned error:", error);
      return [];
    }

    return (data as CharacterRecord[]).map((row) => {
      try {
        const normalized = normalizeCharacterDraft(row.payload);
        return {
          ...normalized,
          id: row.id,
          name: row.name,
          updatedAt: row.updated_at,
        };
      } catch (err) {
        console.error("[repository] failed to normalize row", row.id, err);
        return null;
      }
    }).filter((draft) => draft !== null) as CharacterDraft[];
  } catch (err) {
    // Fall back to local storage on any network/auth error (one attempt, no retry)
    console.warn("[repository] remote fetch failed, falling back to local:", err);
    return [];
  }
}

export async function getRemoteCharacterDraft(id: string): Promise<CharacterDraft | null> {
  const auth = await getAuthedSupabase();

  if (!auth) {
    return null;
  }

  const { supabase } = auth;

  const { data, error } = await supabase
    .from("characters")
    .select("id,name,payload,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as CharacterRecord;
  return {
    ...normalizeCharacterDraft(row.payload),
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

export async function saveRemoteCharacterDraft(draft: CharacterDraft) {
  const auth = await getAuthedSupabase();

  if (!auth) {
    return false;
  }

  const { supabase, userId } = auth;

  const { error } = await supabase.from("characters").upsert(
    {
      id: draft.id,
      user_id: userId,
      name: draft.name,
      payload: normalizeCharacterDraft(draft),
      updated_at: draft.updatedAt,
    },
    { onConflict: "id" },
  );

  return !error;
}

export async function deleteRemoteCharacterDraft(id: string) {
  const auth = await getAuthedSupabase();

  if (!auth) {
    return false;
  }

  const { supabase } = auth;

  const { error } = await supabase.from("characters").delete().eq("id", id);
  return !error;
}
