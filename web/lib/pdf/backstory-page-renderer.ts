import type { PdfSvgAssetBundle } from "@/lib/pdf/svg-assets.server";
import type { CharacterBackstory } from "@/lib/characters/types";
import type { PdfPagePlan, ResolvedPdfCharacter } from "@/lib/pdf/types";
import {
  drawCenteredTextInRect,
  drawFittedText,
  drawSvg,
  drawText,
  insetRect,
  type PdfRect,
  type PdfRenderContext,
} from "@/lib/pdf/drawing";
import {
  BACKSTORY_LEFT_REGIONS,
  BACKSTORY_MIDDLE_REGIONS,
  BACKSTORY_PAGE,
  BACKSTORY_PAGE_REGIONS,
} from "@/lib/pdf/backstory-page-layout";

type PdfDocWithLayoutHelpers = PdfRenderContext["doc"] & {
  dash(length: number, options?: { space?: number }): PdfDocWithLayoutHelpers;
  undash(): PdfDocWithLayoutHelpers;
  rect(x: number, y: number, width: number, height: number): PdfDocWithLayoutHelpers;
  clip(rule?: "evenodd"): PdfDocWithLayoutHelpers;
};

const COLORS = {
  border: "#231F20",
  title: "#2a1c15",
  text: "#111111",
  secondary: "#6f625a",
  // Bumped label grey #8b847e → #444 so the bigger GENDER / AGE / HEIGHT
  // labels stay legible at the new 7pt size (the old grey was tuned for
  // 5.4pt and disappeared at 7pt).
  label: "#444444",
  line: "#c9c0b7",
  placeholder: "#666666",
} as const;

const PDF_BACKSTORY_FONTS = {
  heading: "Magra",
  // Use Teko-Medium (display face) for the small field labels so they
  // match the first-page and companion-page header labels — both
  // pages now use Teko-Medium for GENDER/AGE/HEIGHT/WEIGHT-style
  // labels. Magra stays the body face for prose.
  label: "Helvetica-Bold",
  name: "Teko-SemiBold",
  body: "Magra",
  bodyMedium: "Magra-Bold",
} as const;

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return decodeHtmlEntities(value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim() || fallback;
}

function cleanRichText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return decodeHtmlEntities(value
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[*>]\s+/gm, "- ")
    .replace(/^\s*[-+]\s+/gm, "- ")
    .replace(/^\s*_{3,}\s*$/gm, "----------")
    .replace(/^\s*-{3,}\s*$/gm, "----------")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim() || fallback;
}

function drawFrameTitle(
  ctx: PdfRenderContext,
  title: string,
  rect: PdfRect,
  options: { topOffset?: number; size?: number } = {},
) {
  const topOffset = options.topOffset ?? 15;
  drawCenteredTextInRect(ctx, title, { x: rect.x + 8, y: rect.y + topOffset, width: rect.width - 16, height: 12 }, {
    font: PDF_BACKSTORY_FONTS.heading,
    maxSize: options.size ?? 8,
    minSize: 5.2,
    color: COLORS.title,
    lineBreak: false,
  });
}

function drawHeaderField(
  ctx: PdfRenderContext,
  label: string,
  value: string,
  rect: PdfRect,
  options: { valueSize?: number; labelSize?: number } = {},
) {
  // Bumped label height 6 → 7 and label size 5.4 → 7 so the GENDER /
  // AGE / HEIGHT etc. anchors read as proper section headers (user
  // reference shows them at the same size as the first-page labels,
  // ~7pt). Value offset 7.5 → 8.5 keeps the gap between label and
  // value consistent with the new label height.
  //
  // Value font changed Magra-Bold → Magra (regular weight) to match
  // the first-page header values exactly: first page uses
  // `font: "Helvetica"` (which aliases to Magra regular). The
  // previous Magra-Bold made the backstory values look heavier and
  // visually distinct from the first-page values (user: "now it has
  // different font and weight").
  const labelRect = { x: rect.x + 2, y: rect.y + 1, width: rect.width - 4, height: 7 };
  const valueRect = { x: rect.x + 2, y: rect.y + 8.5, width: rect.width - 4, height: rect.height - 10 };
  drawText(ctx, label.toUpperCase(), labelRect, {
    font: PDF_BACKSTORY_FONTS.label,
    size: options.labelSize ?? 7,
    color: COLORS.label,
    lineBreak: false,
  });
  if (value.trim()) {
    drawFittedText(ctx, value, valueRect, {
      font: PDF_BACKSTORY_FONTS.body,
      maxSize: options.valueSize ?? 9,
      minSize: 6,
      color: "#000000",
      lineBreak: true,
    });
  }
  const doc = ctx.doc as PdfDocWithLayoutHelpers;
  doc.save();
  doc.strokeColor(COLORS.line).lineWidth(0.45).dash(1.2, { space: 1.6 });
  doc.moveTo(rect.x + 2, rect.y + rect.height - 2.2).lineTo(rect.x + rect.width - 2, rect.y + rect.height - 2.2).stroke();
  doc.undash();
  doc.restore();
}

function renderTopHeader(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter, backstory: CharacterBackstory) {
  const rect = BACKSTORY_PAGE_REGIONS.header;
  drawSvg(ctx, assets.frontPageHeaderShell, rect);

  const leftWidth = 325;
  const leftRect = { x: rect.x + 8, y: rect.y + 8, width: leftWidth - 12, height: rect.height - 16 };
  drawFittedText(ctx, cleanText(character.name, "Unnamed character"), {
    x: leftRect.x + 22,
    y: leftRect.y + 18,
    width: leftRect.width - 32,
    height: 38,
  }, {
    font: PDF_BACKSTORY_FONTS.name,
    maxSize: 30,
    minSize: 12,
    color: COLORS.border,
    lineBreak: false,
  });

  const rightX = rect.x + leftWidth + 24;
  const rightWidth = rect.width - (rightX - rect.x) - 30;
  // Move the two-row metadata block up so the bottom row has visible
  // breathing room above the container's lower border ornament
  // (header height = 69, so a row at y=49 + 17 = 66 used to touch the
  // bottom). Bumped up by ~4pt to land the bottom row cleanly inside.
  const topRowY = rect.y + 21;
  const bottomRowY = rect.y + 42;
  const topFieldWidths = [0.25, 0.17, 0.29, 0.29].map((fraction) => Math.floor(rightWidth * fraction));
  const topFieldXs = [
    rightX,
    rightX + topFieldWidths[0],
    rightX + topFieldWidths[0] + topFieldWidths[1],
    rightX + topFieldWidths[0] + topFieldWidths[1] + topFieldWidths[2],
  ];
  const topLabels = ["Gender", "Age", "Height", "Weight"];
  const topValues = [backstory.gender, backstory.age, backstory.height, backstory.weight];
  topValues.forEach((value, index) => {
    const width = topFieldWidths[index];
    drawHeaderField(ctx, topLabels[index], cleanText(value), {
      x: topFieldXs[index] + 1,
      y: topRowY,
      width: width - 2,
      height: 17,
    }, { valueSize: 9, labelSize: 7 });
  });

  const bottomFieldWidths = [0.34, 0.33, 0.33].map((fraction) => Math.floor(rightWidth * fraction));
  const bottomFieldXs = [
    rightX,
    rightX + bottomFieldWidths[0],
    rightX + bottomFieldWidths[0] + bottomFieldWidths[1],
  ];
  const bottomLabels = ["Eyes", "Skin", "Hair"];
  const bottomValues = [backstory.eyes, backstory.skin, backstory.hair];
  bottomValues.forEach((value, index) => {
    const width = bottomFieldWidths[index];
    drawHeaderField(ctx, bottomLabels[index], cleanText(value), {
      x: bottomFieldXs[index] + 1,
      y: bottomRowY,
      width: width - 2,
      height: 17,
    }, { valueSize: 9, labelSize: 7 });
  });

}

function renderPortraitCard(ctx: PdfRenderContext, assets: PdfSvgAssetBundle, character: ResolvedPdfCharacter) {
  const rect = BACKSTORY_LEFT_REGIONS.portrait;
  drawSvg(ctx, assets.generalContainer, rect);
  const imageRect = insetRect(rect, 8, 11);
  if (ctx.characterPortraitImage) {
    const doc = ctx.doc as PdfDocWithLayoutHelpers;
    doc.save();
    doc.rect(imageRect.x, imageRect.y, imageRect.width, imageRect.height).clip();
    (ctx.doc as unknown as {
      image: (
        source: string,
        x: number,
        y: number,
        options: { fit: [number, number]; align: "center"; valign: "center" },
      ) => void;
    }).image(ctx.characterPortraitImage, imageRect.x, imageRect.y, {
      fit: [imageRect.width, imageRect.height],
      align: "center",
      valign: "center",
    });
    doc.restore();
  }
  if (!ctx.characterPortraitImage) {
    drawCenteredTextInRect(ctx, "Portrait", imageRect, {
      font: "Helvetica",
      maxSize: 14,
      minSize: 10,
      color: COLORS.placeholder,
    });
  }
}

function drawSectionedText(
  ctx: PdfRenderContext,
  sections: ReadonlyArray<readonly [string, unknown]>,
  rect: PdfRect,
  options: { labelSize?: number; bodySize?: number; minBodySize?: number; gap?: number } = {},
) {
  const cleanedSections = sections
    .map(([label, value]) => [label, cleanRichText(value)] as const)
    .filter(([, value]) => value.trim());
  if (!cleanedSections.length) {
    return;
  }

  const maxBodySize = options.bodySize ?? 6.9;
  const minBodySize = options.minBodySize ?? 4.7;
  const gap = options.gap ?? 4.5;
  const measure = (bodySize: number) => {
    const labelSize = options.labelSize ?? Math.max(5.3, bodySize * 0.9);
    const lineGap = bodySize * 0.22;
    let total = 0;
    for (const [, clean] of cleanedSections) {
      ctx.doc.save();
      ctx.doc.font(PDF_BACKSTORY_FONTS.body).fontSize(bodySize);
      const measuredHeight = ctx.doc.heightOfString(clean, {
        width: rect.width,
        lineGap,
      });
      ctx.doc.restore();
      total += labelSize + 2 + measuredHeight + 2 + gap;
    }
    return { total, labelSize, lineGap };
  };

  let bodySize = minBodySize;
  let fitted = measure(minBodySize);
  for (let size = maxBodySize; size >= minBodySize; size -= 0.25) {
    const candidate = measure(size);
    if (candidate.total <= rect.height) {
      bodySize = size;
      fitted = candidate;
      break;
    }
  }

  const labelSize = options.labelSize ?? fitted.labelSize;
  const lineGap = fitted.lineGap;
  let cursorY = rect.y;

  for (const [label, clean] of cleanedSections) {
    if (cursorY >= rect.y + rect.height - 8) {
      continue;
    }

    drawText(ctx, `${label.toUpperCase()}:`, {
      x: rect.x,
      y: cursorY,
      width: rect.width,
      height: labelSize + 2,
    }, {
      font: "Magra-Bold",
      size: labelSize,
      color: COLORS.title,
      lineBreak: false,
    });
    cursorY += labelSize + 2;

    ctx.doc.save();
    ctx.doc.font(PDF_BACKSTORY_FONTS.body).fontSize(bodySize);
    const measuredHeight = ctx.doc.heightOfString(clean, {
      width: rect.width,
      lineGap,
    });
    ctx.doc.restore();

    const remainingHeight = Math.max(0, rect.y + rect.height - cursorY);
    if (remainingHeight <= 0) {
      break;
    }

    drawText(ctx, clean, {
      x: rect.x,
      y: cursorY,
      width: rect.width,
      height: Math.min(measuredHeight + 2, remainingHeight),
    }, {
      font: PDF_BACKSTORY_FONTS.body,
      size: bodySize,
      color: COLORS.text,
      lineGap,
    });
    cursorY += Math.min(measuredHeight + 2, remainingHeight) + gap;
  }
}

function renderPersonalCharacteristics(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  backstory: CharacterBackstory,
  rect: PdfRect,
) {
  drawSvg(ctx, assets.generalContainer, rect);
  drawFrameTitle(ctx, "PERSONAL CHARACTERISTICS", rect, { topOffset: 16, size: 7.2 });
  const sections = [
    ["Personality Traits", backstory.personalityTraits],
    ["Ideals", backstory.ideals],
    ["Bonds", backstory.bonds],
    ["Flaws", backstory.flaws],
  ] as const;
  const content = {
    x: rect.x + 10,
    y: rect.y + 38,
    width: rect.width - 20,
    height: rect.height - 49,
  };
  drawSectionedText(ctx, sections, content, { bodySize: 6.6, minBodySize: 4.6, gap: 4 });
}

function renderMiddleBox(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  title: string,
  value: string,
  rect: PdfRect,
) {
  drawSvg(ctx, assets.generalContainer, rect);
  drawFrameTitle(ctx, title, rect, { topOffset: 16, size: 7 });
  const content = {
    x: rect.x + 10,
    y: rect.y + 38,
    width: rect.width - 20,
    height: rect.height - 49,
  };
  if (cleanRichText(value)) {
    drawFittedText(ctx, cleanRichText(value), content, {
      font: PDF_BACKSTORY_FONTS.body,
      maxSize: 7.1,
      minSize: 4.5,
      color: COLORS.text,
      lineGap: 1.2,
    });
  }
}

function renderBackstoryNarrative(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  value: string,
  rect: PdfRect,
) {
  drawSvg(ctx, assets.generalContainer, rect);
  drawFrameTitle(ctx, "BACKSTORY", rect, { topOffset: 16, size: 7.6 });
  const content = {
    x: rect.x + 11,
    y: rect.y + 38,
    width: rect.width - 22,
    height: rect.height - 49,
  };
  const clean = cleanRichText(value);
  if (clean) {
    drawFittedText(ctx, clean, content, {
      font: PDF_BACKSTORY_FONTS.body,
      maxSize: 7.5,
      minSize: 4.5,
      color: COLORS.text,
      lineGap: 1.25,
    });
  }
}

export function renderBackstoryPage(
  ctx: PdfRenderContext,
  assets: PdfSvgAssetBundle,
  character: ResolvedPdfCharacter,
  _page: PdfPagePlan,
) {
  const backstory = character.backstory ?? {
    gender: "",
    age: "",
    height: "",
    weight: "",
    eyes: "",
    skin: "",
    hair: "",
    alignment: character.alignment,
    deity: character.deity,
    personalityTraits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    alliesAndOrganizations: "",
    backstory: "",
    additionalFeatures: "",
  };

  ctx.doc.addPage({ size: [BACKSTORY_PAGE.width, BACKSTORY_PAGE.height], margin: 0 });
  renderTopHeader(ctx, assets, character, backstory);

  renderPortraitCard(ctx, assets, character);

  renderPersonalCharacteristics(ctx, assets, backstory, BACKSTORY_LEFT_REGIONS.personalCharacteristics);

  renderMiddleBox(ctx, assets, "ALLIES & ORGANIZATIONS", backstory.alliesAndOrganizations, BACKSTORY_MIDDLE_REGIONS.allies);
  renderMiddleBox(ctx, assets, "ADDITIONAL FEATURES", backstory.additionalFeatures, BACKSTORY_MIDDLE_REGIONS.additional);
  renderBackstoryNarrative(ctx, assets, backstory.backstory, BACKSTORY_PAGE_REGIONS.right);
}
