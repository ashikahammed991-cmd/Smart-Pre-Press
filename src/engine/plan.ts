import { packAll } from "./pack";
import type { Item } from "./pack";
import { effectiveRatio, setCost } from "./cost";
import type { Job, Placement, Plan, Settings, SheetSet } from "./types";

interface Area {
  W: number;
  H: number;
  /** Offset of the printable area on the press sheet. */
  x0: number;
  y0: number;
}

export function printArea(S: Settings): Area {
  return {
    W: S.sheetW - 2 * S.marginSide,
    H: S.sheetH - S.gripper - S.marginBottom - S.barH,
    x0: S.marginSide,
    y0: S.gripper,
  };
}

/** Settings with the press sheet of one set filled in (the sheet differs per set in auto mode). */
export const withSheet = (S: Settings, set: { sheetW: number; sheetH: number }): Settings => ({ ...S, sheetW: set.sheetW, sheetH: set.sheetH });

const cell = (S: Settings, j: Job) => ({ w: j.w + 2 * S.bleed, h: j.h + 2 * S.bleed });
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
  const c = cell(S, job);
  const out: Grid[] = [];
  const ups = job.ups;
  for (const rot of S.allowRotate && Math.abs(c.w - c.h) > EPS ? [false, true] : [false]) {
    const cw = rot ? c.h : c.w;
    const ch = rot ? c.w : c.h;
    for (let nx = 1; nx <= ups; nx++) {
      if (job.cols > 0 && nx !== job.cols) continue;
      const ny = Math.ceil(ups / nx);
      const bw = nx * cw + (nx - 1) * S.gutter;
      const bh = ny * ch + (ny - 1) * S.gutter;
      if (bw <= A.W + EPS && bh <= A.H + EPS) out.push({ nx, ny, rot, exact: nx * ny === ups, bw, bh });
    }
  }
  return out;
}

/** Place the cells of a grid in reading order, centred in the printable area. */
function gridPlacements(S: Settings, job: Job, g: Grid, A: Area): Placement[] {
  const c = cell(S, job);
  const cw = g.rot ? c.h : c.w;
  const ch = g.rot ? c.w : c.h;
  const x0 = A.x0 + (A.W - g.bw) / 2;
  const y0 = A.y0 + (A.H - g.bh) / 2;
  const out: Placement[] = [];
  for (let i = 0; i < job.ups; i++) {
    const col = i % g.nx;
    const row = Math.floor(i / g.nx);
    out.push({ jobId: job.id, x: x0 + col * (cw + S.gutter), y: y0 + row * (ch + S.gutter), w: cw, h: ch, rot: g.rot });
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

/** Pack several jobs' cells with the general packer. */
function packGroup(S: Settings, group: Job[], A: Area): Placement[] | null {
  const items: Item[] = [];
  for (const j of group) {
    const c = cell(S, j);
    for (let i = 0; i < j.ups; i++) items.push({ key: j.id, w: c.w, h: c.h });
  }
  const packed = packAll(items, A.W, A.H, S.gutter, S.allowRotate);
  if (!packed) return null;
  const byId = new Map(group.map((j) => [j.id, j]));
  return centre(
    packed.map((p) => {
      const c = cell(S, byId.get(p.key)!);
      return { jobId: p.key, x: A.x0 + p.x, y: A.y0 + p.y, w: p.rot ? c.h : c.w, h: p.rot ? c.w : c.h, rot: p.rot };
    }),
    A,
  );
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
    const p = packGroup(Ss, group, A);
    if (p) return { sheet: sh, placements: p };
  }
  return null;
}

const runSheets = (j: Job) => Math.max(1, Math.ceil(j.qty / Math.max(1, j.ups)));

function solve(S: Settings, group: Job[], id: number): SheetSet | null {
  const f = fit(S, group);
  if (!f) return null;
  const sheets = Math.max(...group.map(runSheets));
  const ups = Object.fromEntries(group.map((j) => [j.id, j.ups]));
  const trim = group.reduce((t, j) => t + j.w * j.h * j.ups, 0);
  return {
    id,
    sheetW: f.sheet.w,
    sheetH: f.sheet.h,
    ratio: f.sheet.ratio,
    jobIds: group.map((j) => j.id),
    placements: f.placements,
    ups,
    sheets,
    printed: Object.fromEntries(group.map((j) => [j.id, j.ups * sheets])),
    hasBack: group.some((j) => j.pages >= 2),
    utilisation: trim / (f.sheet.w * f.sheet.h),
  };
}

function planStep(S: Settings, jobs: Job[]): { sets: SheetSet[]; unplaced: string[] } {
  const sets: SheetSet[] = [];
  const unplaced: string[] = [];
  for (const j of jobs) {
    const s = solve(S, [j], sets.length + 1);
    if (s) sets.push(s);
    else unplaced.push(j.id);
  }
  return { sets, unplaced };
}

/** Gang run: jobs share a sheet when it fits and costs less than printing them apart. */
function planGang(S: Settings, jobs: Job[]): { sets: SheetSet[]; unplaced: string[] } {
  const map = new Map(jobs.map((j) => [j.id, j]));
  const costOf = (s: SheetSet) => setCost(S, s, map).total;
  const groups: { jobs: Job[]; set: SheetSet }[] = [];
  const unplaced: string[] = [];

  // similar run lengths together, so no job is printed far beyond its quantity
  for (const j of [...jobs].sort((a, b) => runSheets(b) - runSheets(a))) {
    const solo = solve(S, [j], 0);
    if (!solo) {
      unplaced.push(j.id);
      continue;
    }
    let bestG = -1;
    let bestSet: SheetSet | null = null;
    let bestSaving = 1e-9;
    groups.forEach((g, i) => {
      const merged = solve(S, [...g.jobs, j], 0);
      if (!merged) return;
      const saving = costOf(g.set) + costOf(solo) - costOf(merged);
      if (saving > bestSaving) {
        bestSaving = saving;
        bestG = i;
        bestSet = merged;
      }
    });
    if (bestG >= 0 && bestSet) groups[bestG] = { jobs: [...groups[bestG].jobs, j], set: bestSet };
    else groups.push({ jobs: [j], set: solo });
  }
  return { sets: groups.map((g, i) => ({ ...g.set, id: i + 1 })), unplaced };
}

/** Build the imposition and cost plan for all jobs that have a quantity and a number of ups. */
export function makePlan(S: Settings, allJobs: Job[]): Plan {
  const jobs = allJobs.filter((j) => j.qty > 0 && j.ups > 0 && j.w > 0 && j.h > 0);
  const r = S.mode === "gang" ? planGang(S, jobs) : planStep(S, jobs);
  const map = new Map(jobs.map((j) => [j.id, j]));
  const costs = r.sets.map((s) => setCost(S, s, map));
  return { mode: S.mode === "gang" ? "gang" : "step", sets: r.sets, costs, total: costs.reduce((t, c) => t + c.total, 0), unplaced: r.unplaced };
}

/** Where the guillotine cuts fall: trim-edge positions of every cell and the extent of the printed block. */
export function cutLines(S: Settings, cells: Placement[]): { xs: number[]; ys: number[]; minX: number; maxX: number; minY: number; maxY: number } {
  const xs = new Set<number>();
  const ys = new Set<number>();
  const r = (v: number) => Math.round(v * 100) / 100;
  for (const c of cells) {
    xs.add(r(c.x + S.bleed));
    xs.add(r(c.x + c.w - S.bleed));
    ys.add(r(c.y + S.bleed));
    ys.add(r(c.y + c.h - S.bleed));
  }
  return {
    xs: [...xs].sort((a, b) => a - b),
    ys: [...ys].sort((a, b) => a - b),
    minX: Math.min(...cells.map((c) => c.x)),
    maxX: Math.max(...cells.map((c) => c.x + c.w)),
    minY: Math.min(...cells.map((c) => c.y)),
    maxY: Math.max(...cells.map((c) => c.y + c.h)),
  };
}
