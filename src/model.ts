export interface Pt {
  x: number;
  y: number;
}

export interface Style {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

/** A bezier anchor. `inH` / `outH` are handle offsets relative to `p`. */
export interface Node {
  p: Pt;
  inH: Pt;
  outH: Pt;
}

interface Base extends Style {
  id: string;
  /** Rotation in degrees around the centre of the shape's bounds. */
  rot?: number;
}

export interface RectShape extends Base {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface EllipseShape extends Base {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface LineShape extends Base {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface PathShape extends Base {
  kind: "path";
  nodes: Node[];
  closed: boolean;
}

export type Shape = RectShape | EllipseShape | LineShape | PathShape;

export interface Doc {
  width: number;
  height: number;
  shapes: Shape[]; // painted in array order (last = on top)
}

export const ARTBOARD = { width: 1000, height: 700 };

let counter = 0;
export function newId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
}

export function newDoc(): Doc {
  return { width: ARTBOARD.width, height: ARTBOARD.height, shapes: [] };
}

export function pathData(nodes: Node[], closed: boolean): string {
  if (nodes.length === 0) return "";
  const f = (n: number) => +n.toFixed(2);
  let d = `M ${f(nodes[0].p.x)} ${f(nodes[0].p.y)}`;
  const seg = (a: Node, b: Node) => {
    const c1 = { x: a.p.x + a.outH.x, y: a.p.y + a.outH.y };
    const c2 = { x: b.p.x + b.inH.x, y: b.p.y + b.inH.y };
    return ` C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.p.x)} ${f(b.p.y)}`;
  };
  for (let i = 1; i < nodes.length; i++) d += seg(nodes[i - 1], nodes[i]);
  if (closed && nodes.length > 1) d += seg(nodes[nodes.length - 1], nodes[0]) + " Z";
  return d;
}

export function translate(s: Shape, dx: number, dy: number): void {
  switch (s.kind) {
    case "rect":
      s.x += dx;
      s.y += dy;
      break;
    case "ellipse":
      s.cx += dx;
      s.cy += dy;
      break;
    case "line":
      s.x1 += dx;
      s.y1 += dy;
      s.x2 += dx;
      s.y2 += dy;
      break;
    case "path":
      for (const n of s.nodes) {
        n.p.x += dx;
        n.p.y += dy;
      }
      break;
  }
}

export function bounds(s: Shape): { x: number; y: number; w: number; h: number } {
  switch (s.kind) {
    case "rect":
      return { x: s.x, y: s.y, w: s.w, h: s.h };
    case "ellipse":
      return { x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 };
    case "line": {
      const x = Math.min(s.x1, s.x2);
      const y = Math.min(s.y1, s.y2);
      return { x, y, w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    }
    case "path": {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const n of s.nodes) {
        const pts = [n.p, { x: n.p.x + n.inH.x, y: n.p.y + n.inH.y }, { x: n.p.x + n.outH.x, y: n.p.y + n.outH.y }];
        for (const q of pts) {
          minX = Math.min(minX, q.x);
          minY = Math.min(minY, q.y);
          maxX = Math.max(maxX, q.x);
          maxY = Math.max(maxY, q.y);
        }
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
  }
}

export function center(s: Shape): Pt {
  const b = bounds(s);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function rotatePt(p: Pt, c: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

function rotAttr(s: Shape): string {
  if (!s.rot) return "";
  const c = center(s);
  return ` transform="rotate(${+s.rot.toFixed(2)} ${+c.x.toFixed(2)} ${+c.y.toFixed(2)})"`;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function shapeToSvg(s: Shape, withId = false): string {
  const idAttr = (withId ? ` data-id="${esc(s.id)}"` : "") + rotAttr(s);
  const style = `fill="${esc(s.fill)}" stroke="${esc(s.stroke)}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (s.kind) {
    case "rect":
      return `<rect${idAttr} x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" ${style}/>`;
    case "ellipse":
      return `<ellipse${idAttr} cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" ${style}/>`;
    case "line":
      // A line has no fill; fall back to the stroke colour.
      return `<line${idAttr} x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${esc(s.stroke)}" stroke-width="${Math.max(s.strokeWidth, 1)}" stroke-linecap="round"/>`;
    case "path":
      return `<path${idAttr} d="${pathData(s.nodes, s.closed)}" ${style}${s.closed ? "" : ' fill="none"'}/>`;
  }
}

export function docToSvg(doc: Doc): string {
  const body = doc.shapes.map((s) => "  " + shapeToSvg(s)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">
${body}
</svg>
`;
}
