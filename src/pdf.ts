import { hexToCmyk } from "./color";
import type { Cmyk } from "./color";
import { Doc, Shape, center, mmToPx } from "./model";
import { TextMask, deflate, rasterizeText } from "./text";

/**
 * Minimal PDF writer for print output.
 *  - every colour is written as DeviceCMYK
 *  - TrimBox and BleedBox are set; content is clipped to the bleed box
 *  - optional crop marks in registration colour
 *  - live text is rasterised at 1200 dpi into 1-bit masks painted in the text's CMYK colour
 * The result is a latin-1 string (1 character = 1 byte).
 */

export const TEXT_DPI = 1200;

const PT = 0.75; // 1 px = 0.75 pt
const KAPPA = 0.5522847498;

const n = (v: number, d = 3): string => {
  const r = +v.toFixed(d);
  return Object.is(r, -0) ? "0" : String(r);
};

const fillOp = (c: Cmyk) => `${c.map((x) => n(x, 4)).join(" ")} k`;
const strokeOp = (c: Cmyk) => `${c.map((x) => n(x, 4)).join(" ")} K`;

function shapeStream(s: Shape): string {
  const fillC = s.fillCmyk ?? hexToCmyk(s.fill);
  const strokeC = s.strokeCmyk ?? hexToCmyk(s.stroke);
  let o = "q\n";

  if (s.rot) {
    const c = center(s);
    const a = (s.rot * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    o += `${n(cos, 6)} ${n(sin, 6)} ${n(-sin, 6)} ${n(cos, 6)} ${n(c.x - c.x * cos + c.y * sin, 4)} ${n(c.y - c.x * sin - c.y * cos, 4)} cm\n`;
  }

  let canFill = true;
  let sw = s.strokeWidth;
  let closed = true;

  switch (s.kind) {
    case "rect":
      o += `${n(s.x)} ${n(s.y)} ${n(s.w)} ${n(s.h)} re\n`;
      break;
    case "ellipse": {
      const { cx, cy, rx, ry } = s;
      const kx = KAPPA * rx;
      const ky = KAPPA * ry;
      o += `${n(cx + rx)} ${n(cy)} m\n`;
      o += `${n(cx + rx)} ${n(cy + ky)} ${n(cx + kx)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)} c\n`;
      o += `${n(cx - kx)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + ky)} ${n(cx - rx)} ${n(cy)} c\n`;
      o += `${n(cx - rx)} ${n(cy - ky)} ${n(cx - kx)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)} c\n`;
      o += `${n(cx + kx)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - ky)} ${n(cx + rx)} ${n(cy)} c\nh\n`;
      break;
    }
    case "line":
      o += `${n(s.x1)} ${n(s.y1)} m ${n(s.x2)} ${n(s.y2)} l\n`;
      canFill = false;
      closed = false;
      sw = Math.max(sw, 1);
      break;
    case "text":
      return ""; // drawn separately as a bitmap mask (see textStream)
    case "path": {
      const nodes = s.nodes;
      if (nodes.length === 0) return "";
      o += `${n(nodes[0].p.x)} ${n(nodes[0].p.y)} m\n`;
      const seg = (a: (typeof nodes)[number], b: (typeof nodes)[number]) =>
        `${n(a.p.x + a.outH.x)} ${n(a.p.y + a.outH.y)} ${n(b.p.x + b.inH.x)} ${n(b.p.y + b.inH.y)} ${n(b.p.x)} ${n(b.p.y)} c\n`;
      for (let i = 1; i < nodes.length; i++) o += seg(nodes[i - 1], nodes[i]);
      if (s.closed && nodes.length > 1) o += seg(nodes[nodes.length - 1], nodes[0]) + "h\n";
      canFill = s.closed;
      closed = s.closed;
      break;
    }
  }

  const doStroke = sw > 0;
  const doFill = canFill && closed;
  o += `${fillOp(fillC)}\n${strokeOp(strokeC)}\n${n(sw)} w\n1 J 1 j\n`;
  o += doFill && doStroke ? "B\n" : doFill ? "f\n" : doStroke ? "S\n" : "n\n";
  return o + "Q\n";
}

/** Paint a text mask image (name `/Im<n>`) in the text's CMYK colour, honouring rotation. */
function textStream(s: Shape, m: Pick<TextMask, "x" | "y" | "w" | "h">, name: string): string {
  if (s.kind !== "text") return "";
  const fillC = s.fillCmyk ?? hexToCmyk(s.fill);
  let o = "q\n";
  if (s.rot) {
    const c = center(s);
    const a = (s.rot * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    o += `${n(cos, 6)} ${n(sin, 6)} ${n(-sin, 6)} ${n(cos, 6)} ${n(c.x - c.x * cos + c.y * sin, 4)} ${n(c.y - c.x * sin - c.y * cos, 4)} cm\n`;
  }
  // The image's top row must land at the top of the box; user space here is y-down, so flip once more.
  o += `${fillOp(fillC)}\n${n(m.w, 4)} 0 0 ${n(-m.h, 4)} ${n(m.x, 4)} ${n(m.y + m.h, 4)} cm\n/${name} Do\nQ\n`;
  return o;
}

function bytesToString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
}

function cropMarks(w: number, h: number, bleed: number): string {
  const off = bleed + mmToPx(1); // gap between trim edge and mark, so marks never touch the bleed
  const len = mmToPx(5);
  const seg = (x1: number, y1: number, x2: number, y2: number) => `${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S\n`;
  let o = "q\n1 1 1 1 K\n0.34 w\n";
  for (const [x, dx] of [[0, -1], [w, 1]] as const) {
    for (const [y, dy] of [[0, -1], [h, 1]] as const) {
      o += seg(x + dx * off, y, x + dx * (off + len), y); // horizontal mark
      o += seg(x, y + dy * off, x, y + dy * (off + len)); // vertical mark
    }
  }
  return o + "Q\n";
}

export async function docToPdf(doc: Doc): Promise<string> {
  const W = doc.width;
  const H = doc.height;
  const bleed = Math.max(0, doc.bleed ?? 0);
  const marks = !!doc.cropMarks;
  // Space around the trim edge: bleed, plus room for crop marks if requested.
  const margin = marks ? bleed + mmToPx(7) : bleed;

  const pageW = (W + 2 * margin) * PT;
  const pageH = (H + 2 * margin) * PT;
  const m = margin * PT;
  const b = bleed * PT;

  // Rasterise live text first (one mask at a time keeps memory use low).
  const images: { name: string; obj: string }[] = [];
  const maskOf = new Map<string, string>();
  const placed = new Map<string, Pick<TextMask, "x" | "y" | "w" | "h">>();
  for (const s of doc.shapes) {
    if (s.kind !== "text" || s.hidden || !s.text.trim()) continue;
    const mask = rasterizeText(s, TEXT_DPI);
    const { data, compressed } = await deflate(mask.data);
    const name = `Im${images.length + 1}`;
    const body = bytesToString(data);
    images.push({
      name,
      obj: `<< /Type /XObject /Subtype /Image /Width ${mask.pxW} /Height ${mask.pxH} /ImageMask true /BitsPerComponent 1 /Decode [1 0]${compressed ? " /Filter /FlateDecode" : ""} /Length ${body.length} >>\nstream\n${body}\nendstream`,
    });
    maskOf.set(s.id, name);
    placed.set(s.id, { x: mask.x, y: mask.y, w: mask.w, h: mask.h });
  }

  let content = `q\n${n(PT, 4)} 0 0 ${n(-PT, 4)} ${n(m)} ${n(pageH - m)} cm\n`;
  content += `q\n${n(-bleed)} ${n(-bleed)} ${n(W + 2 * bleed)} ${n(H + 2 * bleed)} re W n\n`;
  for (const s of doc.shapes) {
    if (s.hidden) continue;
    const name = maskOf.get(s.id);
    const mask = placed.get(s.id);
    if (s.kind === "text") {
      if (name && mask) content += textStream(s, mask, name);
    } else content += shapeStream(s);
  }
  content += "Q\n";
  if (marks) content += cropMarks(W, H, bleed);
  content += "Q\n";

  const box = (l: number, bt: number, r: number, t: number) => `[${n(l)} ${n(bt)} ${n(r)} ${n(t)}]`;
  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox ${box(0, 0, pageW, pageH)} /TrimBox ${box(m, m, pageW - m, pageH - m)} /BleedBox ${box(m - b, m - b, pageW - m + b, pageH - m + b)} /Contents 4 0 R /Resources << ${images.length ? `/XObject << ${images.map((im, i) => `/${im.name} ${6 + i} 0 R`).join(" ")} >>` : ""} >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Producer (Smart Pre-Press) /Title (Smart Pre-Press print file) >>",
    ...images.map((im) => im.obj),
  ];

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

/** Convert the latin-1 PDF string into bytes for saving. */
export function pdfBytes(pdf: string): Uint8Array {
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
