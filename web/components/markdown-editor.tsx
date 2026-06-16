"use client";

import { useEffect, useMemo, useRef } from "react";

import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
  type PartialBlock,
} from "@blocknote/core";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";

const DND_THEME = {
  colors: {
    editor: {
      text: "#24150f",
      background: "#fff9ef",
    },
    menu: {
      text: "#24150f",
      background: "#fffdf8",
    },
    tooltip: {
      text: "#fff8f1",
      background: "#922610",
    },
    hovered: {
      text: "#24150f",
      background: "rgba(146, 38, 16, 0.12)",
    },
    selected: {
      text: "#24150f",
      background: "rgba(146, 38, 16, 0.18)",
    },
    border: "#e6cdb5",
    shadow: "rgba(77, 39, 20, 0.12)",
  },
  borderRadius: 18,
  fontFamily: "var(--font-body)",
} as const;

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  compact?: boolean;
  slashContext?: string;
};

type MarkdownRendererProps = {
  value: string;
  compact?: boolean;
};

function getEmptyDocument() {
  return [
    {
      type: "paragraph",
      content: "",
    },
  ] satisfies PartialBlock[];
}

function getMarkdownText(value: string) {
  return value.replace(/[#>*_`~-]/g, " ").replace(/\[(.*?)\]\((.*?)\)/g, "$1").replace(/\s+/g, " ").trim();
}

function createParagraphBlock(text: string): PartialBlock {
  return {
    type: "paragraph",
    content: [
      {
        type: "text",
        text,
      },
    ] as never,
  } as PartialBlock;
}

function createSlashTemplate(title: string, prompt: string) {
  return [
    createParagraphBlock(`## ${title}`),
    createParagraphBlock(prompt),
  ] satisfies PartialBlock[];
}

function getCustomSlashMenuItems(editor: ReturnType<typeof useCreateBlockNote>, slashContext?: string) {
  const defaults = getDefaultReactSlashMenuItems(editor);
  const contextLabel = slashContext ?? "Backstory";

  return [
    ...defaults,
    {
      title: `${contextLabel} prompt`,
      subtext: "Insert a quick D&D note prompt for this section.",
      group: "Character",
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, createParagraphBlock(`${contextLabel}:`));
      },
    },
    {
      title: "Backstory template",
      subtext: "Add a simple origin / turning point / current goal outline.",
      group: "Character",
      onItemClick: () => {
        const insertedBlock = insertOrUpdateBlockForSlashMenu(editor, createParagraphBlock("## Origin"));
        editor.insertBlocks(
          [createParagraphBlock("Where did this character begin?")].concat(
            createSlashTemplate("Turning Point", "What event changed their path?"),
            createSlashTemplate("Current Goal", "What are they chasing now?"),
          ),
          insertedBlock,
          "after",
        );
      },
    },
    {
      title: "Faction note",
      subtext: "Add a faction / ally / enemy heading with a note block.",
      group: "Character",
      onItemClick: () => {
        const insertedBlock = insertOrUpdateBlockForSlashMenu(editor, createParagraphBlock("## Faction or Ally"));
        editor.insertBlocks(
          [createParagraphBlock("How are they connected to this character?")],
          insertedBlock,
          "after",
        );
      },
    },
  ];
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  compact = false,
  slashContext,
}: MarkdownEditorProps) {
  const editor = useCreateBlockNote(
    {
      initialContent: getEmptyDocument(),
      defaultStyles: false,
      placeholders: {
        default: placeholder,
        emptyDocument: placeholder,
      },
    },
    [],
  );
  const lastLoadedMarkdown = useRef<string>("");
  const slashItems = useMemo(
    () => getCustomSlashMenuItems(editor, slashContext),
    [editor, slashContext],
  );

  useEffect(() => {
    const incoming = value.trim();
    const current = lastLoadedMarkdown.current.trim();

    if (incoming === current) {
      return;
    }

    const blocks = incoming ? editor.tryParseMarkdownToBlocks(incoming) : getEmptyDocument();
    editor.replaceBlocks(editor.document, blocks.length ? blocks : getEmptyDocument());
    lastLoadedMarkdown.current = incoming;
  }, [editor, value]);

  return (
    <div className={`markdown-editor${compact ? " markdown-editor--compact" : ""}`}>
      <BlockNoteView
        className="markdown-editor__surface"
        editable
        editor={editor}
        filePanel={false}
        onChange={() => {
          const markdown = editor.blocksToMarkdownLossy(editor.document).trim();
          lastLoadedMarkdown.current = markdown;
          onChange(markdown);
        }}
        sideMenu={false}
        slashMenu={false}
        theme={DND_THEME}
      >
        <SuggestionMenuController
          getItems={async (query) => filterSuggestionItems(slashItems, query)}
          triggerCharacter="/"
        />
      </BlockNoteView>
    </div>
  );
}

export function MarkdownRenderer({ value, compact = false }: MarkdownRendererProps) {
  const editor = useCreateBlockNote(
    {
      initialContent: value.trim() ? undefined : getEmptyDocument(),
      defaultStyles: false,
      placeholders: {
        default: "",
        emptyDocument: "",
      },
    },
    [],
  );

  useEffect(() => {
    const blocks = value.trim() ? editor.tryParseMarkdownToBlocks(value) : getEmptyDocument();
    editor.replaceBlocks(editor.document, blocks.length ? blocks : getEmptyDocument());
  }, [editor, value]);

  if (!getMarkdownText(value)) {
    return <p className="builder-summary__meta">No notes yet.</p>;
  }

  return (
    <div className={`markdown-renderer${compact ? " markdown-renderer--compact" : ""}`}>
      <BlockNoteView
        className="markdown-renderer__surface"
        editable={false}
        editor={editor}
        filePanel={false}
        formattingToolbar={false}
        linkToolbar={false}
        sideMenu={false}
        slashMenu={false}
        tableHandles={false}
        theme={DND_THEME}
      />
    </div>
  );
}

export function hasMarkdownContent(value: string) {
  return Boolean(getMarkdownText(value));
}

export function getMarkdownPreview(value: string, maxLength = 100) {
  const text = getMarkdownText(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}
