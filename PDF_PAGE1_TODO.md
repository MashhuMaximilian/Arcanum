# PDF Page 1 Progress

Last updated: 2026-05-19

## Done

- Created and updated this local tracking file.
- Checked local git working tree status without reverting or modifying other in-flight edits.
- Checked local kanban API visibility once; API was not reachable at `http://localhost:3003/api/tasks`.

## In progress

- Implement resolved PDF weapon attack rows.
- Fix sheet stat accumulation and placeholder resolution.
- Fix negative weapon damage modifier handling.
- Figure out weapons in combat box properly.
- Bigger font and unified typography.
- Validate TypeScript and review worker patches.

Notes:
- Current working tree suggests active implementation across PDF rendering, inventory/equipment, builtins, and content-source resolution.
- Modified tracked files:
  - `web/lib/equipment/inventory.ts`
  - `web/lib/pdf/from-builder.ts`
  - `web/lib/pdf/front-page-renderer.ts`
  - `web/lib/content-sources/aurora.ts`
  - `web/lib/content-sources/catalog-resolver.ts`
  - `web/lib/builtins/backgrounds.ts`
  - `web/lib/builtins/classes.ts`
  - `web/lib/builtins/feats.ts`
  - `web/lib/builtins/races.ts`
  - `web/lib/builtins/types.ts`
- New untracked files:
  - `web/lib/builtins/generated-srd-sheets.ts`
  - `web/lib/builtins/sheets.ts`
  - `web/scripts/generate-srd-sheets.mjs`

## Remaining

- Spells still seem not to use `<sheet>` on print.
- Sheet note/description for first page for racial/subracial/class/etc.
- Action economy / recharge / charges display.
- Possible adaptive two-column layout for small features.

## Validation / push status

- TypeScript validation: not run in this update; still pending.
- Worker patch review: not performed in this update; still pending.
- Git branch state: `main...origin/main`.
- Git working tree summary: 10 modified tracked files, 3 untracked files.
- Push status: not attempted.
- Kanban API status: unreachable at the time of check (`curl` connection failure to `localhost:3003`), so task visibility could not be synced from the local API.
