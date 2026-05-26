"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getBuiltInSrdSpells } from "@/lib/builtins/spells";
import { deleteRemoteCharacterDraft, listRemoteCharacterDrafts } from "@/lib/characters/repository";
import { deleteCharacterDraft, listCharacterDrafts } from "@/lib/characters/storage";
import type { CharacterDraft } from "@/lib/characters/types";
import { mergeCharacterDrafts } from "@/lib/characters/storage";
import { resolveBuilderCatalogs } from "@/lib/content-sources/catalog-resolver";
import { buildPdfCharacterFromDraft } from "@/lib/pdf/from-builder";

export function CharacterList() {
  const [drafts, setDrafts] = useState<CharacterDraft[]>([]);
  const [exportingDraftId, setExportingDraftId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDrafts() {
      const localDrafts = listCharacterDrafts();
      const remoteDrafts = await listRemoteCharacterDrafts();

      if (!cancelled) {
        setDrafts(mergeCharacterDrafts(localDrafts, remoteDrafts));
      }
    }

    void loadDrafts();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id: string) {
    deleteCharacterDraft(id);
    await deleteRemoteCharacterDraft(id);
    setDrafts(mergeCharacterDrafts(listCharacterDrafts(), await listRemoteCharacterDrafts()));
  }

  async function handleDownloadCharacterSheet(draft: CharacterDraft) {
    setExportingDraftId(draft.id);
    setExportError(null);

    try {
      const catalogs = await resolveBuilderCatalogs(getBuiltInSrdSpells());
      const pdfCharacter = buildPdfCharacterFromDraft({ ...catalogs, draft });
      console.log("[DEBUG] character-list - pdfCharacter.companionCards:", pdfCharacter.companionCards?.map((c) => ({ title: c.title, tags: c.tags })));
      const response = await fetch("/pdf-export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pdfCharacter),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `PDF export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${pdfCharacter.name || "arcanum-character"}.pdf`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10_000);
    } catch (error) {
      console.error("Failed to export character sheet", error);
      setExportError("Character sheet export failed. Open the draft and try again if this persists.");
    } finally {
      setExportingDraftId(null);
    }
  }

  if (!drafts.length) {
    return (
      <section className="builder-panel">
        <span className="builder-panel__label">Saved drafts</span>
        <p className="route-shell__copy">
          No saved characters yet. Start a character in the builder and save the draft
          to see it here.
        </p>
        <Link className="button" href="/builder/new">
          Start a character
        </Link>
      </section>
    );
  }

  return (
    <section className="builder-panel">
      <span className="builder-panel__label">Saved drafts</span>
      {exportError ? <p className="builder-summary__meta">{exportError}</p> : null}
      <div className="draft-list">
        {drafts.map((draft) => (
          <article className="draft-card" key={draft.id}>
            <div className="draft-card__meta">
              <strong>{draft.name || "Untitled Adventurer"}</strong>
              <span>
                {draft.playerName || "Unknown player"} · Updated{" "}
                {new Date(draft.updatedAt).toLocaleString()}
              </span>
            </div>
            <div className="draft-card__actions">
              <button
                className="button button--secondary button--compact"
                type="button"
                disabled={exportingDraftId === draft.id}
                onClick={() => handleDownloadCharacterSheet(draft)}
              >
                {exportingDraftId === draft.id ? "Generating..." : "Download Sheet"}
              </button>
              <Link className="button button--secondary button--compact" href={`/builder/${draft.id}`}>
                Edit
              </Link>
              <Link className="button button--secondary button--compact" href={`/characters/${draft.id}`}>
                View
              </Link>
              <button
                className="button button--secondary button--compact"
                type="button"
                onClick={() => handleDelete(draft.id)}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
