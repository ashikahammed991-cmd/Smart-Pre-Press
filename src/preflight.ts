import { hexToCmyk } from "./color";
import { Doc, Shape, bounds, center, pxToMm, rotatePt } from "./model";

export type Level = "error" | "warn" | "info" | "ok";

export interface Issue {
  level: Level;
  text: string;
}

const PT = 0.75;
const TOL = 0.5; // px tolerance when comparing edges

/** Axis-aligned bounds of a shape after rotation. */
function worldBounds(s: Shape): { x0: number; y0: number; x1: number; y1: number } {
  const b = bounds(s);
  let pts = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
  if (s.rot) {
    const c = center(s);
    pts = pts.map((p) => rotatePt(p, c, s.rot!));
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const label = (s: Shape, i: number) => s.name || `${s.kind} ${i + 1}`;

/** Checks a document for common print-production problems. */
export function preflight(doc: Doc): Issue[] {
  const out: Issue[] = [];
  const bleed = Math.max(0, doc.bleed ?? 0);
  const W = doc.width;
  const H = doc.height;

  const visible = doc.shapes.map((s, i) => ({ s, i })).filter(({ s }) => !s.hidden);
  if (visible.length === 0) {
    out.push({ level: "warn", text: "The page has no visible artwork." });
  }

  if (bleed > 0 && pxToMm(bleed) < 2.99) {
    out.push({ level: "warn", text: `Bleed is ${pxToMm(bleed).toFixed(1)} mm; most printers ask for 3 mm.` });
  }

  const missingBleed: string[] = [];
  const outside: string[] = [];
  const highInk: string[] = [];
  const hairline: string[] = [];
  let rgbOnly = 0;

  for (const { s, i } of visible) {
    const wb = worldBounds(s);

    // Entirely outside the printed area (trim + bleed).
    if (wb.x1 < -bleed || wb.y1 < -bleed || wb.x0 > W + bleed || wb.y0 > H + bleed) {
      outside.push(label(s, i));
    } else if (bleed > 0) {
      // Touches the trim edge but stops short of the bleed edge.
      const stopsShort = (min: number, max: number, trimMin: number, trimMax: number) =>
        (min <= trimMin + TOL && min > trimMin - bleed + TOL) || (max >= trimMax - TOL && max < trimMax + bleed - TOL);
      if (stopsShort(wb.x0, wb.x1, 0, W) || stopsShort(wb.y0, wb.y1, 0, H)) missingBleed.push(label(s, i));
    }

    const closedFill = s.kind === "rect" || s.kind === "ellipse" || (s.kind === "path" && s.closed);
    const usesFill = closedFill;
    const usesStroke = s.strokeWidth > 0 || s.kind === "line";

    if (usesFill && !s.fillCmyk) rgbOnly++;
    else if (usesStroke && !s.strokeCmyk) rgbOnly++;

    const ink = (c: number[]) => (c[0] + c[1] + c[2] + c[3]) * 100;
    const fillInk = usesFill ? ink(s.fillCmyk ?? hexToCmyk(s.fill)) : 0;
    const strokeInk = usesStroke ? ink(s.strokeCmyk ?? hexToCmyk(s.stroke)) : 0;
    if (Math.max(fillInk, strokeInk) > 300.5) highInk.push(label(s, i));

    if (s.kind !== "line" && s.strokeWidth > 0 && s.strokeWidth * PT < 0.25) hairline.push(label(s, i));
  }

  const list = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", "));

  if (missingBleed.length) {
    out.push({ level: "error", text: `Artwork touches the trim edge but does not extend into the bleed: ${list(missingBleed)}.` });
  }
  if (highInk.length) {
    out.push({ level: "warn", text: `Total ink above 300%: ${list(highInk)}.` });
  }
  if (hairline.length) {
    out.push({ level: "warn", text: `Stroke thinner than 0.25 pt (may not print): ${list(hairline)}.` });
  }
  if (outside.length) {
    out.push({ level: "info", text: `Completely outside the print area, will be clipped: ${list(outside)}.` });
  }
  if (rgbOnly > 0) {
    out.push({
      level: "info",
      text: `${rgbOnly} shape${rgbOnly === 1 ? " uses" : "s use"} RGB colours; ${rgbOnly === 1 ? "it is" : "they are"} converted to CMYK automatically in the PDF. Type CMYK values for exact control.`,
    });
  }
  const hidden = doc.shapes.filter((s) => s.hidden).length;
  if (hidden) out.push({ level: "info", text: `${hidden} hidden shape${hidden === 1 ? "" : "s"} will not be exported.` });
  if (!doc.cropMarks) out.push({ level: "info", text: "Crop marks are off." });

  if (!out.some((o) => o.level === "error" || o.level === "warn")) {
    out.unshift({ level: "ok", text: "No problems found." });
  }
  return out;
}
