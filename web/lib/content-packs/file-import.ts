"use client";

import { translateExternalJsonToContentPack } from "@/lib/content-packs/external-json-adapter";
import {
  ARCANUM_CONTENT_PACK_FORMAT,
  ARCANUM_CONTENT_PACK_SCHEMA_VERSION,
  validateContentPack,
  type ArcanumContentPack,
} from "@/lib/content-packs/schema";

export const MAX_CONTENT_IMPORT_BYTES = 32 * 1024 * 1024;

function readUint32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

async function inflateRaw(bytes: Uint8Array) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot unpack compressed ZIP files.");
  }
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const stream = new Blob([ownedBytes.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractJsonFilesFromZip(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let offset = Math.max(0, bytes.length - 65_557); offset <= bytes.length - 22; offset += 1) {
    if (readUint32(view, offset) === 0x06054b50) {
      eocd = offset;
    }
  }
  if (eocd < 0) {
    throw new Error("The ZIP file is missing its central directory.");
  }

  const entryCount = view.getUint16(eocd + 10, true);
  let centralOffset = readUint32(view, eocd + 16);
  const decoder = new TextDecoder();
  const files: Array<{ name: string; text: string }> = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, centralOffset) !== 0x02014b50) {
      throw new Error("The ZIP central directory is invalid.");
    }
    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = readUint32(view, centralOffset + 20);
    const fileNameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = readUint32(view, centralOffset + 42);
    const name = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength));
    centralOffset += 46 + fileNameLength + extraLength + commentLength;

    if (!name.toLowerCase().endsWith(".json") || name.startsWith("__MACOSX/")) {
      continue;
    }
    if (readUint32(view, localOffset) !== 0x04034b50) {
      throw new Error(`ZIP entry "${name}" is invalid.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const uncompressed =
      method === 0
        ? compressed
        : method === 8
          ? await inflateRaw(compressed)
          : null;
    if (!uncompressed) {
      throw new Error(`ZIP entry "${name}" uses an unsupported compression method.`);
    }
    files.push({ name, text: decoder.decode(uncompressed) });
  }

  if (!files.length) {
    throw new Error("The ZIP does not contain any JSON files.");
  }
  return files;
}

function mergePacks(name: string, packs: ArcanumContentPack[]) {
  if (packs.length === 1) {
    return packs[0];
  }
  const rulesets = [...new Set(packs.map((pack) => pack.ruleset))];
  if (rulesets.length !== 1) {
    throw new Error("A ZIP import cannot mix 2014 and 2024 rulesets.");
  }

  return validateContentPack({
    format: ARCANUM_CONTENT_PACK_FORMAT,
    schemaVersion: ARCANUM_CONTENT_PACK_SCHEMA_VERSION,
    id: `imported:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    version: new Date().toISOString().slice(0, 10),
    ruleset: rulesets[0],
    language: "en",
    generatedAt: new Date().toISOString(),
    license: {
      name: "Mixed user-provided sources",
      url: "about:blank",
      attribution: packs.map((pack) => pack.license.attribution).filter(Boolean).join("\n"),
      redistributionAllowed: false,
    },
    entries: packs.flatMap((pack) => pack.entries),
  }).pack;
}

export async function importContentPackFile(file: File) {
  if (file.size > MAX_CONTENT_IMPORT_BYTES) {
    throw new Error("Content imports must be smaller than 32 MB.");
  }

  const files = file.name.toLowerCase().endsWith(".zip")
    ? await extractJsonFilesFromZip(await file.arrayBuffer())
    : [{ name: file.name, text: await file.text() }];
  const packs = files.map(({ name, text }) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`"${name}" is not valid JSON.`);
    }
    return translateExternalJsonToContentPack(parsed, {
      id: name.replace(/\.[^.]+$/, ""),
      name: name.replace(/\.[^.]+$/, ""),
    });
  });

  return mergePacks(file.name.replace(/\.[^.]+$/, ""), packs);
}

export async function importContentPackUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid JSON or ZIP URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Content pack URLs must use HTTP or HTTPS.");
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Content download failed with status ${response.status}.`);
  }
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_CONTENT_IMPORT_BYTES) {
    throw new Error("Content imports must be smaller than 32 MB.");
  }

  const blob = await response.blob();
  if (blob.size > MAX_CONTENT_IMPORT_BYTES) {
    throw new Error("Content imports must be smaller than 32 MB.");
  }
  const pathName = url.pathname.split("/").filter(Boolean).at(-1) ?? "content-pack.json";
  const fileName = /\.(json|zip)$/i.test(pathName)
    ? pathName
    : response.headers.get("content-type")?.includes("zip")
      ? `${pathName}.zip`
      : `${pathName}.json`;

  return importContentPackFile(new File([blob], fileName, { type: blob.type }));
}
