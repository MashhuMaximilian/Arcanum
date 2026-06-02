"use client";

import { useEffect, useState } from "react";

import { BuilderCatalogShell } from "@/components/builder-catalog-shell";
import { getRemoteCharacterDraft } from "@/lib/characters/repository";
import { getCharacterDraft } from "@/lib/characters/storage";
import type { CharacterDraft } from "@/lib/characters/types";

type BuilderResumeProps = {
  draftId: string;
};

export function BuilderResume({
  draftId,
}: BuilderResumeProps) {
  const [draft, setDraft] = useState<CharacterDraft | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      const localDraft = getCharacterDraft(draftId);

      if (localDraft) {
        if (!cancelled) {
          setDraft(localDraft);
        }
        return;
      }

      const remoteDraft = await getRemoteCharacterDraft(draftId);

      if (!cancelled) {
        setDraft(remoteDraft);
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

  if (draft === null) {
    return (
      <section className="builder-panel">
        <span className="builder-panel__label">Draft not found</span>
        <p className="route-shell__copy">
          This builder draft only exists in the browser where it was created.
        </p>
      </section>
    );
  }

  return (
    <BuilderCatalogShell
      initialDraft={draft}
    />
  );
}
