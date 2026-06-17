import type { PdfRect } from "@/lib/pdf/drawing";
import { PAGE_SIZE } from "@/lib/pdf/front-page-layout";

export const BACKSTORY_PAGE = {
  width: PAGE_SIZE.width,
  height: PAGE_SIZE.height,
  marginX: 16,
  headerY: 12,
  headerHeight: 69,
  bodyTop: 92,
  bodyBottom: 579,
  gutter: 10,
} as const;

const LEFT_WIDTH = 246;
const MID_WIDTH = 274;
const RIGHT_WIDTH = 270;

export const BACKSTORY_PAGE_REGIONS = {
  header: { x: 16, y: 12, width: 810, height: 69 } satisfies PdfRect,
  left: { x: 16, y: 92, width: LEFT_WIDTH, height: 487 } satisfies PdfRect,
  middle: { x: 272, y: 92, width: MID_WIDTH, height: 487 } satisfies PdfRect,
  right: { x: 556, y: 92, width: RIGHT_WIDTH, height: 487 } satisfies PdfRect,
} as const;

export const BACKSTORY_LEFT_REGIONS = {
  portrait: { x: 16, y: 92, width: LEFT_WIDTH, height: 184 } satisfies PdfRect,
  personalCharacteristics: { x: 16, y: 286, width: LEFT_WIDTH, height: 293 } satisfies PdfRect,
} as const;

export const BACKSTORY_MIDDLE_REGIONS = {
  allies: { x: 272, y: 92, width: MID_WIDTH, height: 226 } satisfies PdfRect,
  additional: { x: 272, y: 326, width: MID_WIDTH, height: 253 } satisfies PdfRect,
} as const;
