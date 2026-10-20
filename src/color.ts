/** A CMYK colour; every channel is 0..1. */
export type Cmyk = [number, number, number, number];

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Simple (non-ICC) RGB -> CMYK conversion. */
export function hexToCmyk(hex: string): Cmyk {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0, 1];
  const v = parseInt(m[1], 16);
  const r = ((v >> 16) & 255) / 255;
  const g = ((v >> 8) & 255) / 255;
  const b = (v & 255) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 1];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}

/** Simple (non-ICC) CMYK -> RGB conversion, used for the on-screen preview. */
export function cmykToHex(c: Cmyk): string {
  const k = clamp01(c[3]);
  const ch = (x: number) =>
    Math.round(255 * (1 - clamp01(x)) * (1 - k))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(c[0])}${ch(c[1])}${ch(c[2])}`;
}

export function clampCmyk(c: number[]): Cmyk {
  return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2]), clamp01(c[3])];
}
