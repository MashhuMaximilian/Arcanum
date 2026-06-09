import type { BuiltInElement } from "@/lib/builtins/types";

function normalizeSelectionToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getSelectionSemanticKey(element: Pick<BuiltInElement, "id" | "name" | "type">) {
  const name = normalizeSelectionToken(element.name);
  const type = normalizeSelectionToken(element.type || "option");
  return name ? `${type}:${name}` : `id:${element.id}`;
}
