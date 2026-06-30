declare module "pdfkit" {
  import { Readable } from "node:stream";

  export type PDFPageOptions = {
    size?: [number, number] | string;
    margin?: number;
    layout?: "portrait" | "landscape";
  };

  export type PDFTextOptions = {
    width?: number;
    height?: number;
    align?: "left" | "center" | "right" | "justify";
    lineBreak?: boolean;
    ellipsis?: boolean;
    lineGap?: number;
    oblique?: number | boolean;
  };

  export default class PDFDocument extends Readable {
    constructor(options?: {
      size?: [number, number] | string;
      margin?: number;
      autoFirstPage?: boolean;
      compress?: boolean;
    });
    addPage(options?: PDFPageOptions): this;
    text(text: string, x?: number, y?: number, options?: PDFTextOptions): this;
    font(name: string): this;
    registerFont(name: string, src: string | Buffer): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    heightOfString(text: string, options?: PDFTextOptions): number;
    widthOfString(text: string): number;
    save(): this;
    restore(): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    strokeColor(color: string): this;
    lineWidth(width: number): this;
    stroke(): this;
    end(): void;
  }
}
