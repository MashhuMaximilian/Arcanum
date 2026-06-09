"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getBuiltInSrdSpells } from "@/lib/builtins/spells";
import {
  deleteRemoteCharacterDraft,
  listRemoteCharacterDrafts,
  saveRemoteCharacterDraft,
} from "@/lib/characters/repository";
import {
  downloadPortableCharacter,
  importPortableCharacterFile,
} from "@/lib/characters/portable";
import {
  deleteCharacterDraft,
  listCharacterDrafts,
  saveCharacterDraft,
} from "@/lib/characters/storage";
import { duplicateCharacterDraft, type CharacterDraft } from "@/lib/characters/types";
import { mergeCharacterDrafts } from "@/lib/characters/storage";
import { resolveBuilderCatalogs } from "@/lib/content-sources/catalog-resolver";
import { buildPdfCharacterFromDraft } from "@/lib/pdf/from-builder";

export function CharacterList() {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<CharacterDraft[]>([]);
  const [exportingDraftId, setExportingDraftId] = useState<string | null>(null);
  const [duplicatingDraftId, setDuplicatingDraftId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

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

  async function handleDuplicate(draft: CharacterDraft) {
    setDuplicatingDraftId(draft.id);
    setExportError(null);

    try {
      const duplicate = duplicateCharacterDraft(draft);
      saveCharacterDraft(duplicate);
      await saveRemoteCharacterDraft(duplicate);
      setDrafts(mergeCharacterDrafts(listCharacterDrafts(), await listRemoteCharacterDrafts()));
    } catch (error) {
      console.error("Failed to duplicate character", error);
      setExportError("Character duplication failed. Please try again.");
    } finally {
      setDuplicatingDraftId(null);
    }
  }

  async function handleDownloadCharacterSheet(draft: CharacterDraft) {
    setExportingDraftId(draft.id);
    setExportError(null);

    try {
      const catalogResponse = await fetch(
        `/api/srd-catalogs?ruleset=${encodeURIComponent(draft.ruleset)}`,
      );
      if (!catalogResponse.ok) {
        throw new Error("Could not load the character ruleset.");
      }
      const catalogData = await catalogResponse.json();
      const catalogs = await resolveBuilderCatalogs({
        baseElements: catalogData.elements ?? [],
        initialSpellElements: catalogData.spells ?? getBuiltInSrdSpells(),
        ruleset: draft.ruleset,
      });
      const pdfCharacter = buildPdfCharacterFromDraft({ ...catalogs, draft });
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

  async function handleImport(file: File | undefined) {
    if (!file) {
      return;
    }

    setIsImporting(true);
    setExportError(null);
    try {
      const imported = await importPortableCharacterFile(file);
      saveCharacterDraft(imported);
      await saveRemoteCharacterDraft(imported);
      router.push(`/builder/${imported.id}`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Character import failed.");
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  return (
    <section className="builder-panel character-library">
      <div className="character-library__header">
        <div>
          <span className="builder-panel__label">Saved drafts</span>
          <h2 className="character-library__title">Your character library</h2>
        </div>
        <div className="character-library__actions">
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImport(event.target.files?.[0])}
          />
          <button
            className="button button--secondary"
            type="button"
            disabled={isImporting}
            onClick={() => importInputRef.current?.click()}
          >
            {isImporting ? "Importing..." : "Import JSON"}
          </button>
          <Link className="button" href="/builder/new">
            New character
          </Link>
        </div>
      </div>
      {exportError ? <p className="builder-summary__meta">{exportError}</p> : null}
      {drafts.length ? <div className="draft-list">
        {drafts.map((draft) => (
          <article className="draft-card" key={draft.id}>
            <div className="draft-card__identity">
              <div className="draft-card__portrait">
                {draft.characterPortraitUrl ? (
                  // User-provided remote URLs cannot use next/image without a domain allowlist.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={draft.characterPortraitUrl} referrerPolicy="no-referrer" />
                ) : (
                  <span>{(draft.name || "A").slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="draft-card__meta">
                <strong>{draft.name || "Untitled Adventurer"}</strong>
                <span>
                  {draft.playerName || "Unknown player"} · Updated{" "}
                  {new Date(draft.updatedAt).toLocaleString()}
                </span>
              </div>
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
                onClick={() => downloadPortableCharacter(draft)}
              >
                Export JSON
              </button>
              <button
                className="button button--secondary button--compact"
                type="button"
                disabled={duplicatingDraftId === draft.id}
                onClick={() => handleDuplicate(draft)}
              >
                {duplicatingDraftId === draft.id ? "Duplicating..." : "Duplicate"}
              </button>
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
      </div> : (
        <div className="character-library__empty">
          <p className="route-shell__copy">
            No saved characters yet. Start a new build or import an Arcanum JSON backup.
          </p>
        </div>
      )}
    </section>
  );
}
