import { effectiveRatio, setCost } from "./cost";
import type { Job, Placement, Plan, Settings, SheetSet } from "./types";

interface Area {
  W: number;
  H: number;
  /** Offset of the printable area on the press sheet. */
  x0: number;
  y0: number;
}

/**
 * Bleed and gutter actually used on the sheet. The gap is measured between trim edges, so each cell
 * only gets as much bleed as fits half the gap; gx / gy are the space left between the bleed boxes.
 */
export function geom(S: Settings): { bx: number; by: number; gx: number; gy: number } {
  const bx = Math.max(0, Math.min(S.bleed, S.gapX / 2));
  const by = Math.max(0, Math.min(S.bleed, S.gapY / 2));
  return { bx, by, gx: Math.max(0, S.gapX - 2 * bx), gy: Math.max(0, S.gapY - 2 * by) };
}

export function printArea(S: Settings): Area {
  // room for the cut marks outside the block, whatever small margins were typed
  const markRoom = S.markGap + S.markLen;
  const side = Math.max(S.marginSide, markRoom);
  const top = Math.max(S.gripper, markRoom);
  const bottom = Math.max(S.marginBottom, markRoom);
  return {
    W: S.sheetW - 2 * side,
    H: S.sheetH - top - bottom - S.barH,
    x0: side,
    y0: top,
  };
}

/** Settings with the press sheet of one set filled in (the sheet differs per set in auto mode). */
export const withSheet = (S: Settings, set: { sheetW: number; sheetH: number }): Settings => ({ ...S, sheetW: set.sheetW, sheetH: set.sheetH });

/** A job's cell on the sheet: trim plus bleed (turned 90° if rot; the bleed stays horizontal / vertical on the sheet). */
const cell = (S: Settings, j: Job, rot = false) => {
  const { bx, by } = geom(S);
  return rot ? { w: j.h + 2 * bx, h: j.w + 2 * by } : { w: j.w + 2 * bx, h: j.h + 2 * by };
};
const EPS = 1e-6;

interface Sheet {
  w: number;
  h: number;
  ratio: number;
}

/** Press sheets to try, best first: highest ratio (smallest sheet), cut from the parent in equal pieces. */
function candidateSheets(S: Settings): Sheet[] {
  if (S.sheetMode === "fixed") return [{ w: S.sheetW, h: S.sheetH, ratio: effectiveRatio(S) }];
  const out = new Map<string, Sheet>();
  for (let a = 1; a <= 16; a++) {
    for (let b = 1; b <= 16; b++) {
      const ratio = a * b;
      if (S.ratio > 0 && ratio !== S.ratio) continue;
      const pw = S.parentW / a;
      const ph = S.parentH / b;
      for (const [w, h] of [[pw, ph], [ph, pw]]) {
        if (w > S.sheetW + EPS || h > S.sheetH + EPS) continue; // too big for the machine
        if (w < S.minSheetW - EPS || h < S.minSheetH - EPS) continue; // too small to feed
        const key = `${w.toFixed(2)}x${h.toFixed(2)}`;
        const have = out.get(key);
        if (!have || have.ratio < ratio) out.set(key, { w, h, ratio });
      }
    }
  }
  return [...out.values()].sort((x, y) => y.ratio - x.ratio || x.w * x.h - y.w * y.h);
}

interface Grid {
  nx: number;
  ny: number;
  rot: boolean;
  exact: boolean;
  /** Block size (cells plus gutters). */
  bw: number;
  bh: number;
}

/** Every grid of `ups` cells (columns x rows, last row may be short) that fits in the printable area. */
function grids(S: Settings, job: Job, A: Area): Grid[] {
  const { gx, gy } = geom(S);
  const out: Grid[] = [];
  const ups = job.ups;
  for (const rot of S.allowRotate && Math.abs(job.w - job.h) > EPS ? [false, true] : [false]) {
    const { w: cw, h: ch } = cell(S, job, rot);
    for (let nx = 1; nx <= ups; nx++) {
      if (job.cols > 0 && nx !== job.cols) continue;
      const ny = Math.ceil(ups / nx);
      const bw = nx * cw + (nx - 1) * gx;
      const bh = ny * ch + (ny - 1) * gy;
      if (bw <= A.W + EPS && bh <= A.H + EPS) out.push({ nx, ny, rot, exact: nx * ny === ups, bw, bh });
    }
  }
  return out;
}

/** Place the cells of a grid in reading order, centred in the printable area. */
function gridPlacements(S: Settings, job: Job, g: Grid, A: Area): Placement[] {
  const { gx, gy } = geom(S);
  const { w: cw, h: ch } = cell(S, job, g.rot);
  const x0 = A.x0 + (A.W - g.bw) / 2;
  const y0 = A.y0 + (A.H - g.bh) / 2;
  const out: Placement[] = [];
  for (let i = 0; i < job.ups; i++) {
    const col = i % g.nx;
    const row = Math.floor(i / g.nx);
    out.push({ jobId: job.id, x: x0 + col * (cw + gx), y: y0 + row * (ch + gy), w: cw, h: ch, rot: g.rot });
  }
  return out;
}

/** Centre the used block inside the printable area (keeps cut marks symmetrical). */
function centre(ps: Placement[], A: Area): Placement[] {
  if (!ps.length) return ps;
  const minX = Math.min(...ps.map((p) => p.x));
  const maxX = Math.max(...ps.map((p) => p.x + p.w));
  const minY = Math.min(...ps.map((p) => p.y));
  const maxY = Math.max(...ps.map((p) => p.y + p.h));
  const dx = A.x0 + (A.W - (maxX - minX)) / 2 - minX;
  const dy = A.y0 + (A.H - (maxY - minY)) / 2 - minY;
  return ps.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

/**
 * Shelf packing, so every layout can be cut with straight (guillotine) cuts: cells sit in rows,
 * a row is first cut off the sheet across its full width, then cut into cells. Several orientation
 * strategies are tried and the one using the least height wins.
 */
function packGroup(S: Settings, group: Job[], A: Area): Placement[] | null {
  type Cell = { id: string; w: number; h: number; rot: boolean };
  type Base = { id: string; w: number; h: number; rw: number; rh: number };
  const { gx, gy } = geom(S);
  // at most as many cells in a row as the typed number of columns
  const maxPer = S.upsCols > 0 ? Math.floor(S.upsCols) : Infinity;
  const base: Base[] = [];
  for (const j of group) {
    const c = cell(S, j);
    const r = cell(S, j, true);
    for (let i = 0; i < j.ups; i++) base.push({ id: j.id, w: c.w, h: c.h, rw: r.w, rh: r.h });
  }
  const strategies: ((c: Base) => boolean)[] = [() => false];
  if (S.allowRotate) strategies.push(() => true, (c) => c.h > c.w, (c) => c.w > c.h);

  let best: { used: number; out: Placement[] } | null = null;
  for (const turn of strategies) {
    const cells: Cell[] = base.map((c) => (turn(c) ? { id: c.id, w: c.rw, h: c.rh, rot: true } : { id: c.id, w: c.w, h: c.h, rot: false }));
    cells.sort((a, b) => b.h - a.h || a.id.localeCompare(b.id, undefined, { numeric: true }) || b.w - a.w);
    const shelves: { y: number; h: number; x: number; n: number }[] = [];
    const out: Placement[] = [];
    let ok = true;
    for (const c of cells) {
      if (c.w > A.W + EPS) {
        ok = false;
        break;
      }
      let sh = shelves.find((s) => c.h <= s.h + EPS && s.x + c.w <= A.W + EPS && s.n < maxPer);
      if (!sh) {
        const y = shelves.length ? shelves[shelves.length - 1].y + shelves[shelves.length - 1].h + gy : 0;
        if (y + c.h > A.H + EPS) {
          ok = false;
          break;
        }
        sh = { y, h: c.h, x: 0, n: 0 };
        shelves.push(sh);
      }
      out.push({ jobId: c.id, x: A.x0 + sh.x, y: A.y0 + sh.y, w: c.w, h: c.h, rot: c.rot });
      sh.x += c.w + gx;
      sh.n++;
    }
    if (!ok) continue;
    const last = shelves[shelves.length - 1];
    const used = last.y + last.h;
    if (!best || used < best.used - EPS) best = { used, out };
  }
  return best ? centre(best.out, A) : null;
}

interface Fit {
  sheet: Sheet;
  placements: Placement[];
}

/** Find the smallest press sheet (highest ratio) that holds every job's ups, and the layout on it. */
function fit(S: Settings, group: Job[]): Fit | null {
  const sheets = candidateSheets(S);
  if (group.length === 1) {
    const job = group[0];
    // Prefer a clean grid (all rows full) on any sheet, then allow a short last row.
    for (const exactOnly of [true, false]) {
      for (const sh of sheets) {
        const Ss = { ...S, sheetW: sh.w, sheetH: sh.h };
        const A = printArea(Ss);
        if (A.W <= 0 || A.H <= 0) continue;
        const list = grids(Ss, job, A).filter((g) => (exactOnly ? g.exact : true));
        if (!list.length) continue;
        // squarest block first: fewer, longer cuts are not the goal, a compact block is
        list.sort((a, b) => Number(b.exact) - Number(a.exact) || a.bw * a.bh - b.bw * b.bh || Math.abs(a.nx - a.ny) - Math.abs(b.nx - b.ny));
        return { sheet: sh, placements: gridPlacements(Ss, job, list[0], A) };
      }
    }
  }
  for (const sh of sheets) {
    const Ss = { ...S, sheetW: sh.w, sheetH: sh.h };
    const A = printArea(Ss);
    if (A.W <= 0 || A.H <= 0) continue;
    const need = group.reduce((t, j) => t + Math.min(cell(S, j).w * cell(S, j).h, cell(S, j, true).w * cell(S, j, true).h) * j.ups, 0);
    if (need > A.W * A.H + EPS) continue; // cannot fit by area alone
    const p = packGroup(Ss, group, A);
    if (p) return { sheet: sh, placements: p };
  }
  return null;
}

const runSheets = (j: Job) => Math.max(1, Math.ceil(j.qty / Math.max(1, j.ups)));

/** Total ups the user allows on one sheet (columns x rows). */
export const totalUps = (S: Settings): number => Math.max(0, Math.floor(S.upsCols)) * Math.max(0, Math.floor(S.upsRows));

function makeSet(group: Job[], f: Fit, id: number): SheetSet {
  const sheets = Math.max(...group.map(runSheets));
  const trim = group.reduce((t, j) => t + j.w * j.h * j.ups, 0);
  return {
    id,
    sheetW: f.sheet.w,
    sheetH: f.sheet.h,
    ratio: f.sheet.ratio,
    jobIds: group.map((j) => j.id),
    placements: f.placements,
    ups: Object.fromEntries(group.map((j) => [j.id, j.ups])),
    sheets,
    printed: Object.fromEntries(group.map((j) => [j.id, j.ups * sheets])),
    hasBack: group.some((j) => j.pages >= 2),
    utilisation: trim / (f.sheet.w * f.sheet.h),
  };
}

/**
 * One sheet set for `group`. A single job takes all the ups (in the typed columns x rows grid).
 * Several jobs share the ups: the run length N is the smallest for which every job's copies
 * ceil(qty / N) together stay within the ups and still fit on a sheet, so all jobs finish together.
 */
function solve(S: Settings, group: Job[], id: number): SheetSet | null {
  const T = totalUps(S);
  if (T <= 0 || group.length > T) return null;

  if (group.length === 1) {
    const j = { ...group[0], ups: T, cols: Math.max(0, Math.floor(S.upsCols)) };
    const f = fit(S, [j]);
    return f ? makeSet([j], f, id) : null;
  }

  // copies of each job for a run of n sheets; the spare ups (up to the typed total) go to the jobs
  // that need them most, so every sheet carries exactly the typed number of ups
  const upsFor = (n: number): Job[] => {
    const g = group.map((j) => ({ ...j, cols: 0, ups: Math.max(1, Math.ceil(j.qty / n)) }));
    let spare = T - g.reduce((t, j) => t + j.ups, 0);
    while (spare > 0) {
      let k = 0;
      for (let i = 1; i < g.length; i++) if (g[i].qty / g[i].ups > g[k].qty / g[k].ups) k = i;
      g[k].ups++;
      spare--;
    }
    return g;
  };
  const feasible = (n: number): Fit | null => {
    const g = upsFor(n);
    if (g.reduce((t, j) => t + j.ups, 0) !== T) return null; // more than T needed at this run length
    return fit(S, g);
  };
  let lo = Math.max(1, Math.ceil(group.reduce((t, j) => t + j.qty, 0) / T));
  let hi = Math.max(...group.map((j) => j.qty));
  let bestFit = feasible(hi);
  if (!bestFit) return null;
  let bestN = hi;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const f = feasible(mid);
    if (f) {
      bestFit = f;
      bestN = mid;
      hi = mid;
    } else lo = mid + 1;
  }
  // the packer is a heuristic, so check a few smaller run lengths too
  for (let n = Math.max(1, bestN - 3); n < bestN; n++) {
    const f = feasible(n);
    if (f) {
      bestFit = f;
      bestN = n;
      break;
    }
  }
  return makeSet(upsFor(bestN), bestFit, id);
}

function planStep(S: Settings, jobs: Job[], strict = false): { sets: SheetSet[]; unplaced: string[] } {
  const sets: SheetSet[] = [];
  const unplaced: string[] = [];
  for (const j of jobs) {
    const s = solve(S, [j], sets.length + 1);
    if (s) sets.push(s);
    else {
      unplaced.push(j.id);
      if (strict) break;
    }
  }
  return { sets, unplaced };
}

/**
 * Combine sizes: start with one set per job and keep merging the two sets whose merge saves the
 * most money (fewer plates and make-readies against a few more sheets), until no merge helps.
 */
function planGang(S: Settings, jobs: Job[], strict = false): { sets: SheetSet[]; unplaced: string[] } {
  const map = new Map(jobs.map((j) => [j.id, j]));
  const costOf = (s: SheetSet) => setCost(S, s, map).total;
  type G = { jobs: Job[]; set: SheetSet; cost: number };
  let groups: G[] = [];
  const unplaced: string[] = [];
  for (const j of jobs) {
    const solo = solve(S, [j], 0);
    if (!solo) {
      unplaced.push(j.id);
      if (strict) return { sets: [], unplaced };
    } else groups.push({ jobs: [j], set: solo, cost: costOf(solo) });
  }

  const order = new Map(jobs.map((j, i) => [j.id, i]));
  const cache = new Map<string, G | null>();
  const merged = (a: G, b: G): G | null => {
    const all = [...a.jobs, ...b.jobs].sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
    const key = all.map((j) => j.id).sort().join("\u0001");
    if (cache.has(key)) return cache.get(key)!;
    const set = solve(S, all, 0);
    const g = set ? { jobs: all, set, cost: costOf(set) } : null;
    cache.set(key, g);
    return g;
  };

  for (;;) {
    let best: { i: number; k: number; g: G; saving: number } | null = null;
    for (let i = 0; i < groups.length; i++) {
      for (let k = i + 1; k < groups.length; k++) {
        const g = merged(groups[i], groups[k]);
        if (!g) continue;
        const saving = groups[i].cost + groups[k].cost - g.cost;
        // "plates": merge whenever it fits (fewest plate sets), the cheapest merge first; "cost": only merges that save money
        const worth = S.priority === "cost" ? saving > 1e-9 : true;
        if (worth && (!best || saving > best.saving)) best = { i, k, g, saving };
      }
    }
    if (!best) break;
    const { i, k, g } = best;
    groups = [...groups.filter((_, x) => x !== i && x !== k), g];
  }
  return { sets: groups.map((g, i) => ({ ...g.set, id: i + 1 })), unplaced };
}

/**
 * Build the imposition and cost plan for all jobs that have a quantity.
 * Every sheet set carries the same total ups on the same press sheet (so one ratio for the whole
 * job): in auto mode the smallest sheet on which every set fits is used.
 */
export function makePlan(S: Settings, allJobs: Job[]): Plan {
  const jobs = allJobs.filter((j) => j.qty > 0 && j.w > 0 && j.h > 0);
  const map = new Map(jobs.map((j) => [j.id, j]));
  const run = (S2: Settings, strict: boolean) => (S2.mode === "gang" ? planGang(S2, jobs, strict) : planStep(S2, jobs, strict));

  let chosen: { S2: Settings; r: { sets: SheetSet[]; unplaced: string[] } } | null = null;
  if (S.sheetMode === "fixed") {
    chosen = { S2: S, r: run(S, false) };
  } else {
    const cands = candidateSheets(S);
    // the smallest sheet that works, plus the next few larger ones (a bigger sheet can allow more sharing); keep the best
    const plateCount = (r: { sets: SheetSet[] }) => r.sets.reduce((t, x) => t + (S.colorsFront + (x.hasBack ? S.colorsBack : 0)), 0);
    const total = (r: { sets: SheetSet[] }) => r.sets.reduce((t, x) => t + setCost(S, x, map).total, 0);
    const better = (a: { sets: SheetSet[] }, b: { sets: SheetSet[] }) =>
      S.priority === "plates" && S.mode === "gang" ? plateCount(a) < plateCount(b) || (plateCount(a) === plateCount(b) && total(a) < total(b) - 1e-9) : total(a) < total(b) - 1e-9;
    let tried = 0;
    for (let i = 0; i < cands.length && tried < 4; i++) {
      const c = cands[i];
      const S2: Settings = { ...S, sheetMode: "fixed", sheetW: c.w, sheetH: c.h, ratio: c.ratio };
      const last = i === cands.length - 1;
      const r = run(S2, !(last && !chosen));
      if (r.unplaced.length) {
        if (last && !chosen) chosen = { S2, r };
        continue;
      }
      tried++;
      if (!chosen || chosen.r.unplaced.length || better(r, chosen.r)) chosen = { S2, r };
    }
    if (!chosen) chosen = { S2: S, r: { sets: [], unplaced: jobs.map((j) => j.id) } };
  }
  const costs = chosen.r.sets.map((s) => setCost(S, s, map));
  return { mode: S.mode === "gang" ? "gang" : "step", sets: chosen.r.sets, costs, total: costs.reduce((t, c) => t + c.total, 0), unplaced: chosen.r.unplaced };
}

export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Cut marks for a layout. Horizontal cuts (full-width row cuts) get ticks in the left and right
 * margins; vertical cuts get ticks at the top and bottom. When all rows share the same column cuts
 * (a plain grid) the ticks sit outside the printed block; with mixed sizes each row also gets its
 * own ticks in the bleed gap next to that row, because its vertical cuts differ from the others.
 */
export function cutMarks(S: Settings, cells: Placement[]): Seg[] {
  if (!cells.length) return [];
  const r = (v: number) => Math.round(v * 100) / 100;
  const gap = S.markGap;
  const len = S.markLen;
  const { bx, by } = geom(S);
  const minX = Math.min(...cells.map((c) => c.x));
  const maxX = Math.max(...cells.map((c) => c.x + c.w));
  const minY = Math.min(...cells.map((c) => c.y));
  const maxY = Math.max(...cells.map((c) => c.y + c.h));

  // rows: cells that start at the same y
  const rows = new Map<number, Placement[]>();
  for (const c of cells) rows.set(r(c.y), [...(rows.get(r(c.y)) ?? []), c]);
  const rowList = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, cs]) => ({
    top: Math.min(...cs.map((c) => c.y)) + by,
    bottom: Math.max(...cs.map((c) => c.y + c.h)) - by,
    xs: [...new Set(cs.flatMap((c) => [r(c.x + bx), r(c.x + c.w - bx)]))].sort((a, b) => a - b),
  }));

  const segs: Seg[] = [];
  const ysCut = new Set<number>();
  for (const row of rowList) {
    ysCut.add(r(row.top));
    ysCut.add(r(row.bottom));
  }
  for (const y of ysCut) {
    segs.push({ x1: Math.max(0, minX - gap - len), y1: y, x2: Math.max(0, minX - gap), y2: y });
    segs.push({ x1: maxX + gap, y1: y, x2: Math.min(S.sheetW, maxX + gap + len), y2: y });
  }

  // a plain grid: every row's cuts are among the cuts of the fullest row (a short last row is fine)
  const ref = rowList.reduce((a, b) => (b.xs.length > a.xs.length ? b : a)).xs;
  const sameCols = rowList.every((row) => row.xs.every((x) => ref.some((q) => Math.abs(q - x) < 0.02)));
  if (sameCols) {
    for (const x of ref) {
      segs.push({ x1: x, y1: Math.max(0, minY - gap - len), x2: x, y2: Math.max(0, minY - gap) });
      segs.push({ x1: x, y1: maxY + gap, x2: x, y2: Math.min(S.sheetH, maxY + gap + len) });
    }
    return segs;
  }
  const inBleed = Math.max(0.8, Math.min(len, by - 0.4));
  rowList.forEach((row, i) => {
    for (const x of row.xs) {
      if (i === 0) segs.push({ x1: x, y1: Math.max(0, minY - gap - len), x2: x, y2: Math.max(0, minY - gap) });
      else segs.push({ x1: x, y1: row.top - inBleed, x2: x, y2: row.top - 0.3 });
      if (i === rowList.length - 1) segs.push({ x1: x, y1: maxY + gap, x2: x, y2: Math.min(S.sheetH, maxY + gap + len) });
      else segs.push({ x1: x, y1: row.bottom + 0.3, x2: x, y2: row.bottom + inBleed });
    }
  });
  return segs;
}
