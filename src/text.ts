import { TextShape, familyCss } from "./model";

/**
 * Text measuring and rasterising. Everything here uses the browser's own text engine, so Bangla
 * conjuncts, Arabic joining, Devanagari and every other script that the system fonts support are
 * shaped correctly, and the canvas, the exported SVG and the PDF mask all show the same result.
 */

export interface TextProps {
  fontFamily: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
}

export interface TextMetrics {
  w: number;
  h: number;
  asc: number;
  lh: number;
}

let ctx: CanvasRenderingContext2D | null = null;
function c2d(): CanvasRenderingContext2D {
  if (!ctx) {
    const c = document.createElement("canvas").getContext("2d");
    if (!c) throw new Error("Canvas is not available");
    ctx = c;
  }
  return ctx;
}

export function fontCss(p: TextProps, size = p.fontSize): string {
  return `${p.italic ? "italic " : ""}${p.bold ? "bold " : ""}${+size.toFixed(3)}px ${familyCss(p.fontFamily)}`;
}

/** Measure a (multi-line) text: box size, first-baseline offset and line height, in px. */
export function measureText(text: string, p: TextProps): TextMetrics {
  const c = c2d();
  c.font = fontCss(p);
  const lines = text.split("\n");
  let w = 0;
  let asc = 0;
  let desc = 0;
  for (const line of lines) {
    const m = c.measureText(line.length ? line : " ");
    w = Math.max(w, m.width);
    asc = Math.max(asc, m.fontBoundingBoxAscent ?? 0, m.actualBoundingBoxAscent ?? 0);
    desc = Math.max(desc, m.fontBoundingBoxDescent ?? 0, m.actualBoundingBoxDescent ?? 0);
  }
  if (asc + desc <= 0) {
    asc = p.fontSize * 0.92;
    desc = p.fontSize * 0.28;
  }
  const lh = asc + desc;
  return { w: Math.max(w, 1), h: lines.length * lh, asc, lh };
}

export interface TextMask {
  /** Placement of the bitmap in document px (the text box plus a small safety margin). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Bitmap size in pixels and packed 1-bit data (1 = ink), rows padded to whole bytes. */
  pxW: number;
  pxH: number;
  data: Uint8Array;
  dpi: number;
}

const MAX_CANVAS_DIM = 15000;
const STRIP_PIXELS = 6_000_000;

/** Draw the text at print resolution and pack it into a 1-bit mask. */
export function rasterizeText(s: TextShape, dpi = 1200): TextMask {
  const pad = Math.max(2, s.fontSize * 0.2); // room for italic overhang and tall accents
  const boxW = s.w + 2 * pad;
  const boxH = s.h + 2 * pad;
  const scale = Math.min(dpi / 96, MAX_CANVAS_DIM / boxW, 60000 / boxH);
  const pxW = Math.max(1, Math.ceil(boxW * scale));
  const pxH = Math.max(1, Math.ceil(boxH * scale));
  const stride = Math.ceil(pxW / 8);
  const data = new Uint8Array(stride * pxH);

  const stripH = Math.max(1, Math.min(pxH, Math.floor(STRIP_PIXELS / pxW)));
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = stripH;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("Canvas is not available");
  const lines = s.text.split("\n");

  for (let r0 = 0; r0 < pxH; r0 += stripH) {
    const rows = Math.min(stripH, pxH - r0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pxW, stripH);
    g.setTransform(1, 0, 0, 1, 0, -r0);
    g.font = fontCss(s, s.fontSize * scale);
    g.fillStyle = "#000";
    g.textBaseline = "alphabetic";
    lines.forEach((line, i) => g.fillText(line, pad * scale, (pad + s.asc + i * s.lh) * scale));
    const img = g.getImageData(0, 0, pxW, rows).data;
    for (let y = 0; y < rows; y++) {
      const rowStart = (r0 + y) * stride;
      for (let x = 0; x < pxW; x++) {
        if (img[(y * pxW + x) * 4 + 3] >= 128) data[rowStart + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return { x: s.x - pad, y: s.y - pad, w: boxW, h: boxH, pxW, pxH, data, dpi: (pxW / boxW) * 96 };
}

/** zlib-compress bytes (what PDF's FlateDecode expects); returns the input unchanged if unsupported. */
export async function deflate(bytes: Uint8Array): Promise<{ data: Uint8Array; compressed: boolean }> {
  if (typeof CompressionStream === "undefined") return { data: bytes, compressed: false };
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  return { data: out, compressed: true };
}

/** Common font names offered in the font box; the user can type any installed font. */
export const COMMON_FONTS = [
  "Arial",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Georgia",
  "Tahoma",
  "Segoe UI",
  "Calibri",
  "Cambria",
  "Impact",
  "Nirmala UI",
  "Vrinda",
  "Shonar Bangla",
  "Noto Sans Bengali",
  "Noto Sans",
  "Noto Serif",
  "Mangal",
  "Arial Unicode MS",
  "Microsoft YaHei",
  "Yu Gothic",
  "Malgun Gothic",
  "Sylfaen",
  "Helvetica",
  "serif",
  "sans-serif",
  "monospace",
];

/** Try to list the installed fonts (Chromium's Local Font Access API); falls back to the common list. */
export async function listFonts(): Promise<string[]> {
  try {
    const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
    if (q) {
      const fonts = await q.call(window);
      const names = Array.from(new Set(fonts.map((f) => f.family))).sort((a, b) => a.localeCompare(b));
      if (names.length) return names;
    }
  } catch {
    /* permission denied or unsupported */
  }
  return COMMON_FONTS;
}
