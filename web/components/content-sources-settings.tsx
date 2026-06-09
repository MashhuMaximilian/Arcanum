"use client";

import { useEffect, useRef, useState } from "react";

import {
  createContentSource,
  deleteContentSource,
  hydrateSourceCacheFromRemote,
  listDeviceCachedSources,
  listContentSources,
  listSourceSyncRuns,
  queueContentSourceSync,
  toggleContentSource,
} from "@/lib/content-sources/repository";
import { listCachedElements } from "@/lib/content-sources/cache";
import { BUNDLED_CONTENT_SOURCES } from "@/lib/content-packs/bundled";
import {
  importContentPackFile,
  importContentPackUrl,
} from "@/lib/content-packs/file-import";
import {
  cacheContentPackOnDevice,
  downloadContentPack,
  listDeviceContentPacks,
  loadDeviceContentPack,
  removeDeviceContentPack,
  type DeviceContentPackSummary,
} from "@/lib/content-packs/storage";
import {
  SUGGESTED_SOURCE_INDEXES,
  type CachedSourceSummary,
  type ContentSource,
  type SourceSyncRun,
} from "@/lib/content-sources/types";

type ContentSourcesSettingsProps = {
  isAuthenticated: boolean;
};

type SourceTypeCounts = Record<string, Record<string, number>>;

const DIAGNOSTIC_TYPES = ["Class", "Archetype", "Race", "Sub Race", "Background", "Feat"] as const;

function formatTypeCounts(counts: Record<string, number> | undefined) {
  if (!counts) {
    return "";
  }

  return DIAGNOSTIC_TYPES.map((type) => {
    const label =
      type === "Class"
        ? "Classes"
        : type === "Archetype"
          ? "Subclasses"
          : type === "Sub Race"
            ? "Subraces"
            : type === "Background"
              ? "Backgrounds"
              : type === "Feat"
                ? "Feats"
            : `${type}s`;
    return `${label}: ${counts[type] ?? 0}`;
  }).join(" · ");
}

export function ContentSourcesSettings({
  isAuthenticated,
}: ContentSourcesSettingsProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [devicePacks, setDevicePacks] = useState<DeviceContentPackSummary[]>([]);
  const [cachedSources, setCachedSources] = useState<Record<string, CachedSourceSummary>>({});
  const [cachedTypeCounts, setCachedTypeCounts] = useState<SourceTypeCounts>({});
  const [syncRuns, setSyncRuns] = useState<SourceSyncRun[]>([]);
  const [name, setName] = useState("");
  const [indexUrl, setIndexUrl] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"error" | "success">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncingSourceIds, setSyncingSourceIds] = useState<string[]>([]);
  const [cachingSourceIds, setCachingSourceIds] = useState<string[]>([]);
  const [isImportingPack, setIsImportingPack] = useState(false);
  const [packUrl, setPackUrl] = useState("");

  function isIndexUrl(value: string) {
    try {
      const url = new URL(value.trim());
      return url.pathname.endsWith(".index");
    } catch {
      return false;
    }
  }

  async function refresh() {
    const [nextSources, nextRuns, localCache, cachedElements, nextDevicePacks] = await Promise.all([
      listContentSources(),
      listSourceSyncRuns(),
      listDeviceCachedSources(),
      listCachedElements().catch(() => []),
      listDeviceContentPacks().catch(() => []),
    ]);
    setSources(nextSources);
    setSyncRuns(nextRuns);
    setDevicePacks(nextDevicePacks);
    setCachedSources(
      Object.fromEntries(localCache.map((entry) => [entry.sourceId, entry])),
    );
    setCachedTypeCounts(
      cachedElements.reduce<SourceTypeCounts>((accumulator, element) => {
        const sourceId = "sourceId" in element ? String(element.sourceId) : "";
        if (!sourceId) {
          return accumulator;
        }

        const type = "element_type" in element ? String(element.element_type) : "";
        if (!type) {
          return accumulator;
        }

        accumulator[sourceId] ??= {};
        accumulator[sourceId][type] = (accumulator[sourceId][type] ?? 0) + 1;
        return accumulator;
      }, {}),
    );
  }

  useEffect(() => {
    void refresh();
  }, [isAuthenticated]);

  async function handleImportPack(file: File) {
    setIsImportingPack(true);
    setStatus("");
    try {
      const pack = await importContentPackFile(file);
      const result = await cacheContentPackOnDevice(pack);
      setStatusTone("success");
      setStatus(
        `Imported ${pack.name}: ${result.elementCount} entries cached on this device for ${pack.ruleset}.`,
      );
      await refresh();
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Content import failed.");
    } finally {
      setIsImportingPack(false);
    }
  }

  async function handleImportPackUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsImportingPack(true);
    setStatus("");
    try {
      const pack = await importContentPackUrl(packUrl);
      const result = await cacheContentPackOnDevice(pack);
      setPackUrl("");
      setStatusTone("success");
      setStatus(
        `Imported ${pack.name}: ${result.elementCount} entries cached on this device for ${pack.ruleset}.`,
      );
      await refresh();
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Content import failed.");
    } finally {
      setIsImportingPack(false);
    }
  }

  async function handleAddSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");
    setStatusTone("success");

    if (!isIndexUrl(indexUrl)) {
      setIsSubmitting(false);
      setStatusTone("error");
      setStatus("Content sources must point to an Aurora-compatible .index URL.");
      return;
    }

    const result = await createContentSource({
      name: name.trim() || "Aurora Source",
      indexUrl: indexUrl.trim(),
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setStatusTone("error");
      setStatus(result.error);
      return;
    }

    setName("");
    setIndexUrl("");
    setStatusTone("success");
    setStatus("Source added.");
    await refresh();
  }

  async function handleQueueSync(source: ContentSource) {
    if (!source.enabled) {
      setStatusTone("error");
      setStatus(`Enable ${source.name} before syncing it.`);
      return;
    }

    if (source.sync_status === "queued" || source.sync_status === "syncing") {
      setStatusTone("error");
      setStatus(`${source.name} already has an active sync.`);
      return;
    }

    setStatus("");
    setStatusTone("success");
    setSyncingSourceIds((current) =>
      current.includes(source.id) ? current : [...current, source.id],
    );
    const result = await queueContentSourceSync(source);
    setSyncingSourceIds((current) => current.filter((entry) => entry !== source.id));

    if (!result.ok) {
      if ("status" in result && result.status === 409) {
        await refresh();
      }
      setStatusTone("error");
      setStatus(result.error);
      return;
    }

    setStatus(
      result.warningCount
        ? `Synced ${source.name} with warnings: ${result.discoveredFileCount} files discovered, ${result.parsedFileCount} parsed, ${result.upsertedElementCount} elements imported, ${result.cachedElementCount} cached on this device. ${result.warningSummary ?? ""}`.trim()
        : `Synced ${source.name}: ${result.discoveredFileCount} files discovered, ${result.parsedFileCount} parsed, ${result.upsertedElementCount} elements imported, ${result.cachedElementCount} cached on this device.`,
    );
    await refresh();
  }

  async function handleCacheOnDevice(source: ContentSource) {
    setStatus("");
    setStatusTone("success");
    setCachingSourceIds((current) =>
      current.includes(source.id) ? current : [...current, source.id],
    );

    try {
      const result = await hydrateSourceCacheFromRemote(source);
      setStatus(
        `Cached ${source.name} on this device: ${result.fileCount} files and ${result.elementCount} elements.`,
      );
      await refresh();
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "Could not cache source on this device.");
    } finally {
      setCachingSourceIds((current) => current.filter((entry) => entry !== source.id));
    }
  }

  async function handleToggle(source: ContentSource) {
    await toggleContentSource(source.id, !source.enabled);
    await refresh();
  }

  async function handleDelete(id: string) {
    await deleteContentSource(id);
    await refresh();
  }

  return (
    <div className="builder-shell">
      <section className="builder-panel">
        <span className="builder-panel__label">Built-in rules</span>
        <h2 className="route-shell__title">Content library</h2>
        <p className="route-shell__copy">
          Official SRD rules are included automatically. Choose the 2014 or 2024 ruleset when creating a character.
        </p>
        <div className="draft-list">
          {BUNDLED_CONTENT_SOURCES.map((source) => (
            <article className="draft-card" key={source.id}>
              <div className="draft-card__meta">
                <strong>{source.name}</strong>
                <span>{source.description}</span>
                <span>{source.version} · {source.licenseName} · Always available</span>
              </div>
              <a
                className="button button--secondary button--compact"
                href={source.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                Attribution
              </a>
            </article>
          ))}
        </div>
        {status ? (
          <p
            className={`auth-card__status${
              statusTone === "error" ? " auth-card__status--error" : " auth-card__status--success"
            }`}
          >
            {status}
          </p>
        ) : null}
      </section>

      <section className="builder-panel">
        <span className="builder-panel__label">Add content</span>
        <h3 className="builder-summary__name">Import a content pack</h3>
        <p className="route-shell__copy">
          Import an Arcanum pack or supported JSON/ZIP collection. Translation and storage happen on this device.
        </p>
        <input
          ref={importInputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json,.zip,application/zip"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleImportPack(file);
            }
            event.target.value = "";
          }}
        />
        <div className="builder-summary__actions">
          <button
            className="button"
            type="button"
            disabled={isImportingPack}
            onClick={() => importInputRef.current?.click()}
          >
            {isImportingPack ? "Importing..." : "Import JSON or ZIP"}
          </button>
        </div>
        <details>
          <summary>Advanced: import from a URL</summary>
          <form className="builder-panel__fields" onSubmit={handleImportPackUrl}>
            <label className="builder-field">
              <span>Direct JSON or ZIP URL</span>
              <input
                className="input"
                type="url"
                value={packUrl}
                onChange={(event) => setPackUrl(event.target.value)}
                placeholder="https://example.com/arcanum-content.json"
                required
              />
            </label>
            <div className="builder-summary__actions">
              <button className="button button--secondary" type="submit" disabled={isImportingPack}>
                {isImportingPack ? "Importing..." : "Import URL to this device"}
              </button>
            </div>
          </form>
        </details>
        {devicePacks.length ? (
          <div className="draft-list">
            {devicePacks.map((pack) => (
              <article className="draft-card" key={pack.sourceId}>
                <div className="draft-card__meta">
                  <strong>{pack.sourceName}</strong>
                  <span>{pack.ruleset} · {pack.elementCount} entries · {pack.licenseName}</span>
                  <span>Cached on this device {new Date(pack.cachedAt).toLocaleString()}</span>
                  {pack.attribution ? <span>{pack.attribution}</span> : null}
                </div>
                <div className="draft-card__actions">
                  <button
                    className="button button--secondary button--compact"
                    type="button"
                    onClick={async () => downloadContentPack(await loadDeviceContentPack(pack.sourceId))}
                  >
                    Export pack
                  </button>
                  <button
                    className="button button--secondary button--compact"
                    type="button"
                    onClick={async () => {
                      await removeDeviceContentPack(pack.sourceId);
                      setStatusTone("success");
                      setStatus(`${pack.sourceName} was removed from this device.`);
                      await refresh();
                    }}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <details className="builder-panel">
        <summary>
          <span className="builder-panel__label">Legacy Aurora sources</span>
          <strong>Advanced URL synchronization</strong>
        </summary>
        {!isAuthenticated ? (
          <p className="route-shell__copy">
            Sign in to synchronize legacy Aurora indexes. Device-local JSON and ZIP imports work without an account.
          </p>
        ) : (
          <>
            <form className="builder-panel__fields" onSubmit={handleAddSource}>
              <label className="builder-field">
                <span>Display name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Aurora Core"
                />
              </label>
              <label className="builder-field">
                <span>Aurora .index URL</span>
                <input
                  className="input"
                  type="url"
                  value={indexUrl}
                  onChange={(event) => setIndexUrl(event.target.value)}
                  placeholder="https://raw.githubusercontent.com/aurorabuilder/elements/master/core.index"
                  required
                />
              </label>
              <div className="builder-summary__actions">
                <button className="button" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Adding..." : "Add legacy source"}
                </button>
              </div>
            </form>
            <div className="draft-list">
              {SUGGESTED_SOURCE_INDEXES.map((entry) => (
                <article className="draft-card" key={entry.indexUrl}>
                  <div className="draft-card__meta">
                    <strong>{entry.name}</strong>
                    <span>{entry.indexUrl}</span>
                  </div>
                  <button
                    className="button button--secondary button--compact"
                    type="button"
                    onClick={() => {
                      setName(entry.name);
                      setIndexUrl(entry.indexUrl);
                    }}
                  >
                    Use URL
                  </button>
                </article>
              ))}
            </div>
          </>
        )}

        <span className="builder-panel__label">Your legacy sources</span>
        {!sources.length ? (
          <p className="route-shell__copy">
            No Aurora indexes added.
          </p>
        ) : (
          <div className="draft-list">
            {sources.map((source) => (
              <article className="draft-card" key={source.id}>
                <div className="draft-card__meta">
                  {cachedSources[source.id] ? (
                    <span>
                      Cached on this device · {cachedSources[source.id].elementCount} elements ·{" "}
                      {new Date(cachedSources[source.id].cachedAt).toLocaleString()}
                    </span>
                  ) : (
                    <span>Not cached on this device</span>
                  )}
                  <strong>{source.name}</strong>
                  <span>{source.index_url}</span>
                  <span>
                    Status: {source.sync_status}
                    {source.last_synced_at
                      ? ` · Last synced ${new Date(source.last_synced_at).toLocaleString()}`
                      : ""}
                  </span>
                  {cachedTypeCounts[source.id] ? (
                    <span>Cached types · {formatTypeCounts(cachedTypeCounts[source.id])}</span>
                  ) : null}
                  {source.last_sync_error ? <span>Error: {source.last_sync_error}</span> : null}
                </div>
                <div className="draft-card__actions">
                  <button
                    className="button button--secondary button--compact"
                    type="button"
                    disabled={
                      !source.enabled ||
                      syncingSourceIds.includes(source.id) ||
                      source.sync_status === "queued" ||
                      source.sync_status === "syncing"
                    }
                    onClick={() => handleQueueSync(source)}
                  >
                    {syncingSourceIds.includes(source.id) ||
                    source.sync_status === "queued" ||
                    source.sync_status === "syncing"
                      ? "Syncing..."
                      : "Sync now"}
                  </button>
                  <button
                    className="button button--secondary button--compact"
                    type="button"
                    disabled={cachingSourceIds.includes(source.id)}
                    onClick={() => handleCacheOnDevice(source)}
                  >
                    {cachingSourceIds.includes(source.id) ? "Caching..." : "Cache on this device"}
                  </button>
                  <button
                    className="button button--secondary button--compact"
                    type="button"
                    onClick={() => handleToggle(source)}
                  >
                    {source.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="button button--secondary button--compact"
                    type="button"
                    onClick={() => handleDelete(source.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </details>

      {isAuthenticated ? <section className="builder-panel">
        <span className="builder-panel__label">Recent sync activity</span>
        {!syncRuns.length ? (
          <p className="route-shell__copy">
            No sync runs yet. Once a source sync starts, you will see discovered files, parsed files,
            and imported element counts here.
          </p>
        ) : (
          <div className="draft-list">
            {syncRuns.map((run) => (
              <article className="draft-card" key={run.id}>
                <div className="draft-card__meta">
                  <strong>{run.status}</strong>
                  <span>Started {new Date(run.started_at).toLocaleString()}</span>
                  <span>
                    Files {run.discovered_file_count} · Parsed {run.parsed_file_count} · Upserted{" "}
                    {run.upserted_element_count}
                  </span>
                  {run.error_text ? <span>Error: {run.error_text}</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section> : null}

      <section className="builder-panel">
        <span className="builder-panel__label">Privacy and licensing</span>
        <ul className="route-shell__list">
          <li>SRD 5.1 and SRD 5.2.1 ship with the app under CC BY 4.0.</li>
          <li>JSON and ZIP packs stay in this browser&apos;s device storage.</li>
          <li>Legacy Aurora sources remain private to your account and device cache.</li>
          <li>Non-SRD imported content is not intended to become a public shared library by default.</li>
          <li>Adding third-party or non-SRD sources is your choice and should respect the rights of their original publishers.</li>
        </ul>
      </section>
    </div>
  );
}
