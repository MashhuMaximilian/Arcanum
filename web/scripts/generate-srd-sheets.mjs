import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT = path.resolve(ROOT, "web/lib/builtins/generated-srd-sheets.ts");
const SOURCE_PATHS = [
  "aurora-elements/core/players-handbook/classes",
  "aurora-elements/core/players-handbook/races",
  "aurora-elements/core/players-handbook/feats.xml",
  "aurora-elements/core/players-handbook/backgrounds",
  "aurora-elements/core/dungeon-masters-guide/classes",
];

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripComments(value) {
  return value.replace(/<!--[\s\S]*?-->/g, "");
}

function stripTags(value) {
  return decodeXml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseAttributes(tag) {
  const attributes = {};
  const matches = tag.matchAll(/(\w+)="([^"]*)"/g);
  for (const match of matches) {
    attributes[match[1]] = decodeXml(match[2]);
  }
  return attributes;
}

function parseSheet(elementBody) {
  const match = elementBody.match(/<sheet\s*([^>]*)\/>|<sheet\s*([^>]*)>([\s\S]*?)<\/sheet>/i);
  if (!match) {
    return null;
  }

  const attributes = parseAttributes(match[1] || match[2] || "");
  const body = match[3] || "";
  const descriptions = [...body.matchAll(/<description\s*([^>]*)>([\s\S]*?)<\/description>/gi)]
    .map((descriptionMatch) => {
      const descriptionAttributes = parseAttributes(descriptionMatch[1] || "");
      const html = descriptionMatch[2].trim();
      const text = stripTags(html);
      if (!text) {
        return null;
      }
      return {
        text,
        html,
        level: descriptionAttributes.level ? Number(descriptionAttributes.level) : undefined,
        usage: descriptionAttributes.usage,
        alt: descriptionAttributes.alt,
      };
    })
    .filter(Boolean);

  return {
    display: attributes.display === "false" ? false : attributes.display === "true" ? true : undefined,
    action: attributes.action,
    usage: attributes.usage,
    alt: attributes.alt,
    descriptions,
  };
}

function collectXmlFiles(relativePath) {
  const absolutePath = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) {
    return absolutePath.endsWith(".xml") ? [absolutePath] : [];
  }

  return fs.readdirSync(absolutePath)
    .filter((entry) => entry.endsWith(".xml"))
    .map((entry) => path.join(absolutePath, entry));
}

const sheets = {};

for (const sourcePath of SOURCE_PATHS) {
  for (const filePath of collectXmlFiles(sourcePath)) {
    const xml = stripComments(fs.readFileSync(filePath, "utf8"));
    const elements = [...xml.matchAll(/<element\s+([^>]*)>([\s\S]*?)<\/element>/g)];
    for (const element of elements) {
      const attributes = parseAttributes(element[1]);
      if (!attributes.id) {
        continue;
      }
      const sheet = parseSheet(element[2]);
      if (sheet) {
        sheets[attributes.id] = sheet;
      }
    }
  }
}

const output = `import type { BuiltInSheet } from "@/lib/builtins/types";\n\nexport const BUILT_IN_SRD_SHEETS = ${JSON.stringify(
  sheets,
  null,
  2,
)} satisfies Record<string, BuiltInSheet>;\n`;

fs.writeFileSync(OUTPUT, output);
console.log(`Wrote ${Object.keys(sheets).length} built-in sheet records to ${OUTPUT}`);
