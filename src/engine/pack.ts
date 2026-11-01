import type { Rect } from "./types";

export interface Item {
  key: string;
  w: number;
  h: number;
}

export interface Packed {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: boolean;
}

/** MaxRects bin: best-short-side-fit with optional 90 degree rotation. */
class Bin {
  free: Rect[];
  constructor(W: number, H: number) {
    this.free = [{ x: 0, y: 0, w: W, h: H }];
  }

  insert(w: number, h: number, rotate: boolean): { x: number; y: number; w: number; h: number; rot: boolean } | null {
    let best: { x: number; y: number; w: number; h: number; rot: boolean } | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    const eps = 1e-6;
    for (const f of this.free) {
      for (const rot of rotate && Math.abs(w - h) > eps ? [false, true] : [false]) {
        const iw = rot ? h : w;
        const ih = rot ? w : h;
        if (iw <= f.w + eps && ih <= f.h + eps) {
          const short = Math.min(f.w - iw, f.h - ih);
          const long = Math.max(f.w - iw, f.h - ih);
          if (short < bestShort - eps || (Math.abs(short - bestShort) <= eps && long < bestLong)) {
            best = { x: f.x, y: f.y, w: iw, h: ih, rot };
            bestShort = short;
            bestLong = long;
          }
        }
      }
    }
    if (!best) return null;
    this.place(best);
    return best;
  }

  private place(r: Rect): void {
    const next: Rect[] = [];
    const eps = 1e-6;
    for (const f of this.free) {
      if (r.x >= f.x + f.w - eps || r.x + r.w <= f.x + eps || r.y >= f.y + f.h - eps || r.y + r.h <= f.y + eps) {
        next.push(f);
        continue;
      }
      if (r.x > f.x + eps) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w - eps) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - (r.x + r.w), h: f.h });
      if (r.y > f.y + eps) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h - eps) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - (r.y + r.h) });
    }
    // drop free rectangles that lie inside another one (keep one of any identical pair)
    const inside = (a: Rect, b: Rect) => a.x >= b.x - eps && a.y >= b.y - eps && a.x + a.w <= b.x + b.w + eps && a.y + a.h <= b.y + b.h + eps;
    this.free = next.filter((a, i) => !next.some((b, j) => j !== i && inside(a, b) && (!inside(b, a) || j < i)));
  }
}

const ORDERS: ((a: Item, b: Item) => number)[] = [
  (a, b) => b.w * b.h - a.w * a.h,
  (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
  (a, b) => b.h - a.h || b.w - a.w,
  (a, b) => b.w - a.w || b.h - a.h,
];

/** Result of the best-fitting arrangement of `items` in a W x H area (gutter is added around each item). */
export function packAll(items: Item[], W: number, H: number, gutter: number, rotate: boolean): Packed[] | null {
  const inflated = items.map((it) => ({ ...it, w: it.w + gutter, h: it.h + gutter }));
  for (const order of ORDERS) {
    const bin = new Bin(W + gutter, H + gutter);
    const out: Packed[] = [];
    let ok = true;
    for (const it of [...inflated].sort(order)) {
      const r = bin.insert(it.w, it.h, rotate);
      if (!r) {
        ok = false;
        break;
      }
      out.push({ key: it.key, x: r.x, y: r.y, w: r.w - gutter, h: r.h - gutter, rot: r.rot });
    }
    if (ok) return out;
  }
  return null;
}

/** Regular grid of identical cells: returns the best (count, columns, rows, rotated) layout. */
export function bestGrid(w: number, h: number, W: number, H: number, gutter: number, rotate: boolean): { count: number; nx: number; ny: number; rot: boolean } {
  const fit = (cw: number, ch: number) => ({ nx: Math.max(0, Math.floor((W + gutter + 1e-6) / (cw + gutter))), ny: Math.max(0, Math.floor((H + gutter + 1e-6) / (ch + gutter))) });
  const a = fit(w, h);
  let best = { count: a.nx * a.ny, nx: a.nx, ny: a.ny, rot: false };
  if (rotate) {
    const b = fit(h, w);
    if (b.nx * b.ny > best.count) best = { count: b.nx * b.ny, nx: b.nx, ny: b.ny, rot: true };
  }
  return best;
}
