import { PDFDocument, PDFFont, PDFPage, StandardFonts, cmyk, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from "pdf-lib";
import { cutMarks, geom, printArea, withSheet } from "./engine/plan";
import type { Job, Placement, Plan, Settings, SheetSet } from "./engine/types";

const PT = 72 / 25.4; // 1 mm in PDF points
type Matrix = [number, number, number, number, number, number];

/** Matrix product: apply `a` first, then `b` (PDF convention x' = a*x + c*y + e). */
function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

export interface PdfInfo {
  /** Trim size in mm after the page's own /Rotate is applied. */
  w: number;
  h: number;
  pages: number;
}

/** Read the page count and the trim size (TrimBox, else MediaBox) of a PDF. */
export async function readPdfInfo(bytes: Uint8Array): Promise<PdfInfo> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPageCount();
  if (pages < 1) throw new Error("The PDF has no pages");
  const page = doc.getPage(0);
  const box = page.getTrimBox();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const w = (swap ? box.height : box.width) / PT;
  const h = (swap ? box.width : box.height) / PT;
  return { w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100, pages };
}

const REG = cmyk(1, 1, 1, 1);
const BLACK = cmyk(0, 0, 0, 1);

function safe(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, "?");
}

interface Src {
  doc: PDFDocument;
}

/** Build the imposed, print-ready PDF: one page per sheet side, original artwork kept as vector / full-resolution images. */
export async function buildImposedPdf(S0: Settings, plan: Plan, jobs: Job[], sources: Map<string, Uint8Array>, onProgress?: (msg: string) => void): Promise<Uint8Array> {
  let S = S0;
  const out = await PDFDocument.create();
  out.setTitle("Smart Pre-Press imposed sheets");
  out.setProducer("Smart Pre-Press");
  const font = await out.embedFont(StandardFonts.Helvetica);
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const srcs = new Map<string, Src>();
  const embedded = new Map<string, Awaited<ReturnType<PDFDocument["embedPage"]>>>();

  const { bx, by } = geom(S0);
  const getEmbedded = async (jobId: string, pageIndex: number, rot: boolean) => {
    const key = `${jobId}:${pageIndex}:${rot ? 1 : 0}`;
    const have = embedded.get(key);
    if (have) return have;
    let src = srcs.get(jobId);
    if (!src) {
      const bytes = sources.get(jobId);
      if (!bytes) throw new Error(`Missing PDF data for job ${jobId}`);
      src = { doc: await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }) };
      srcs.set(jobId, src);
    }
    const page = src.doc.getPage(Math.min(pageIndex, src.doc.getPageCount() - 1));
    const t = page.getTrimBox();
    // bleed on the artwork's own axes: when the cell is turned 90° the sheet's X bleed is the artwork's Y bleed
    const ax = (rot ? by : bx) * PT;
    const ay = (rot ? bx : by) * PT;
    const e = await out.embedPage(page, { left: t.x - ax, bottom: t.y - ay, right: t.x + t.width + ax, top: t.y + t.height + ay });
    embedded.set(key, e);
    return e;
  };

  const rotationOf = (jobId: string, pageIndex: number) => {
    const page = srcs.get(jobId)?.doc.getPage(Math.min(pageIndex, (srcs.get(jobId)?.doc.getPageCount() ?? 1) - 1));
    return page ? (((page.getRotation().angle % 360) + 360) % 360) : 0;
  };

  for (const set of plan.sets) {
    S = withSheet(S0, set); // every set can have its own press sheet size
    const sides: ("front" | "back")[] = set.hasBack ? ["front", "back"] : ["front"];
    for (const side of sides) {
      onProgress?.(`Sheet set ${set.id} (${side})`);
      const page = out.addPage([S.sheetW * PT, S.sheetH * PT]);
      const mirror = side === "back";
      const cells = set.placements.map((p) => (mirror ? { ...p, x: S.sheetW - p.x - p.w } : p));

      for (const p of cells) {
        const job = jobMap.get(p.jobId);
        if (!job) continue;
        const pageIndex = side === "front" ? 0 : 1;
        if (side === "back" && job.pages < 2) {
          drawBlank(page, p, S);
          continue;
        }
        const e = await getEmbedded(p.jobId, pageIndex, p.rot);
        const prot = rotationOf(p.jobId, pageIndex);
        placeForm(page, e, prot, p, S);
      }
      drawMarks(page, S, cells, set, side, font);
    }
  }
  return await out.save();
}

/** Draw a form so its (post-/Rotate) content fills the cell p, turned a further 90 degrees clockwise if p.rot. */
function placeForm(page: PDFPage, e: { ref: unknown; width: number; height: number }, pageRot: number, p: Placement, S: Settings): void {
  // size of the embedded content as stored (before /Rotate)
  const w0 = e.width;
  const h0 = e.height;
  // /Rotate (clockwise) turns the stored content; afterwards it occupies [0,w1] x [0,h1]
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  let w1 = w0;
  if (pageRot === 90) {
    m = [0, -1, 1, 0, 0, w0];
    w1 = h0;
  } else if (pageRot === 180) {
    m = [-1, 0, 0, -1, w0, h0];
  } else if (pageRot === 270) {
    m = [0, 1, -1, 0, h0, 0];
    w1 = h0;
  }
  // cell lower-left corner in PDF space
  const X = p.x * PT;
  const Y = (S.sheetH - p.y - p.h) * PT;
  let place: Matrix;
  if (p.rot) {
    // artwork turned 90 degrees clockwise: (x, y) -> (y, -x), then moved so it lands in the cell
    place = [0, -1, 1, 0, X, Y + w1];
  } else place = [1, 0, 0, 1, X, Y];
  const total = mul(m, place);
  const name = (page.node as unknown as { newXObject(tag: string, ref: unknown): never }).newXObject("Fm", e.ref);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...total), drawObject(name), popGraphicsState());
}

function drawBlank(page: PDFPage, p: Placement, S: Settings): void {
  const { bx, by } = geom(S);
  const x = (p.x + bx) * PT;
  const y = (S.sheetH - p.y - p.h + by) * PT;
  page.drawRectangle({ x, y, width: (p.w - 2 * bx) * PT, height: (p.h - 2 * by) * PT, borderColor: REG, borderWidth: 0.25 });
}

function drawMarks(page: PDFPage, S: Settings, cells: Placement[], set: SheetSet, side: "front" | "back", font: PDFFont): void {
  const A = printArea(S);
  const minY = Math.min(...cells.map((c) => c.y));
  const maxY = Math.max(...cells.map((c) => c.y + c.h));
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1 * PT, y: (S.sheetH - y1) * PT }, end: { x: x2 * PT, y: (S.sheetH - y2) * PT }, thickness: 0.25, color: REG });

  // cut marks: ticks at every cut (see cutMarks in engine/plan.ts)
  for (const sg of cutMarks(S, cells)) line(sg.x1, sg.y1, sg.x2, sg.y2);

  // registration targets: left, right and top centre
  const target = (cx: number, cy: number) => {
    const r = 1.6;
    page.drawCircle({ x: cx * PT, y: (S.sheetH - cy) * PT, size: r * PT, borderColor: REG, borderWidth: 0.25 });
    line(cx - r * 1.6, cy, cx + r * 1.6, cy);
    line(cx, cy - r * 1.6, cx, cy + r * 1.6);
  };
  const midY = (minY + maxY) / 2;
  if (S.marginSide >= 4.5) {
    target(S.marginSide / 2, midY);
    target(S.sheetW - S.marginSide / 2, midY);
  }
  if (S.gripper >= 8) target(S.sheetW / 2, S.gripper / 2 + 1.5);

  // colour bar in the strip below the printable area
  const by = A.y0 + A.H + 1;
  const bh = Math.max(2, S.barH - 2);
  if (S.barH >= 4) {
    const patches: [number, number, number, number][] = [
      [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1],
      [0, 1, 1, 0], [1, 0, 1, 0], [1, 1, 0, 0], [1, 1, 1, 0],
      [0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0, 0, 0.5],
      [0.25, 0, 0, 0], [0, 0.25, 0, 0], [0, 0, 0.25, 0], [0, 0, 0, 0.25],
    ];
    const pw = Math.min(6, Math.max(3, A.W / patches.length));
    patches.forEach((c, i) => page.drawRectangle({ x: (A.x0 + i * pw) * PT, y: (S.sheetH - by - bh) * PT, width: pw * PT, height: bh * PT, color: cmyk(...c) }));
  }

  // slug line in the gripper margin
  const names = set.jobIds.map((id) => `${id}`).join(", ");
  const ups = set.jobIds.map((id) => `${set.ups[id]} ups`).join("+");
  const text = safe(`Smart Pre-Press | Set ${set.id} | ${side.toUpperCase()}${side === "back" ? " (turn left-to-right)" : ""} | ${ups} | ratio ${set.ratio} | ${Math.round(set.sheetW)}x${Math.round(set.sheetH)} mm | ${set.sheets} sheets | ${names}`);
  if (S.gripper >= 5) page.drawText(text.slice(0, 160), { x: A.x0 * PT, y: (S.sheetH - 3.5) * PT, size: 6, font, color: BLACK });
}
