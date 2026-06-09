"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BuilderCatalogShell } from "@/components/builder-catalog-shell";
import { getRemoteCharacterDraft } from "@/lib/characters/repository";
import { getCharacterDraft } from "@/lib/characters/storage";
import type { CharacterDraft } from "@/lib/characters/types";

type CharacterSheetProps = {
  draftId: string;
};

export function CharacterSheet({ draftId }: CharacterSheetProps) {
  const [draft, setDraft] = useState<CharacterDraft | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      const resolved = getCharacterDraft(draftId) ?? await getRemoteCharacterDraft(draftId);
      if (!cancelled) {
        setDraft(resolved);
      }
    }

    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  if (draft === undefined) {
    return null;
  }

  if (!draft) {
    return (
      <section className="builder-panel">
        <span className="builder-panel__label">Character not found</span>
        <p className="route-shell__copy">This character is not available on this device or account.</p>
        <Link className="button" href="/characters">Back to library</Link>
      </section>
    );
  }

  return <BuilderCatalogShell initialDraft={draft} mode="view" />;
}
