import { bestGrid, packAll } from "./pack";
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

const cell = (S: Settings, j: Job) => ({ w: j.w + 2 * S.bleed, h: j.h + 2 * S.bleed });

/** Place `ups` copies of each job; returns null when they do not all fit. */
function arrange(S: Settings, group: Job[], ups: Record<string, number>): Placement[] | null {
  const A = printArea(S);
  if (A.W <= 0 || A.H <= 0) return null;

  // One job on its own: a clean grid when it is big enough, otherwise let the packer try.
  if (group.length === 1) {
    const j = group[0];
    const c = cell(S, j);
    const n = ups[j.id] ?? 0;
    const g = bestGrid(c.w, c.h, A.W, A.H, S.gutter, S.allowRotate);
    if (g.count >= n) {
      const cw = g.rot ? c.h : c.w;
      const ch = g.rot ? c.w : c.h;
      const out: Placement[] = [];
      for (let i = 0; i < n; i++) {
        const col = i % g.nx;
        const row = Math.floor(i / g.nx);
        out.push({ jobId: j.id, x: A.x0 + col * (cw + S.gutter), y: A.y0 + row * (ch + S.gutter), w: cw, h: ch, rot: g.rot });
      }
      return centre(out, A);
    }
  }

  const items: Item[] = [];
  for (const j of group) {
    const c = cell(S, j);
    for (let i = 0; i < (ups[j.id] ?? 0); i++) items.push({ key: j.id, w: c.w, h: c.h });
  }
  const packed = packAll(items, A.W, A.H, S.gutter, S.allowRotate);
  if (!packed) return null;
  const byId = new Map(group.map((j) => [j.id, j]));
  return centre(
    packed.map((p) => {
      const j = byId.get(p.key)!;
      const c = cell(S, j);
      // the packer reports `rot` relative to the (w,h) it was given
      return { jobId: p.key, x: A.x0 + p.x, y: A.y0 + p.y, w: p.rot ? c.h : c.w, h: p.rot ? c.w : c.h, rot: p.rot };
    }),
    A,
  );
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

/** Smallest number of sheets N so that ceil(qty/N) copies of every job fit on one sheet. */
function solve(S: Settings, group: Job[], id: number): SheetSet | null {
  const maxQty = Math.max(...group.map((j) => j.qty));
  const upsFor = (n: number) => Object.fromEntries(group.map((j) => [j.id, Math.max(1, Math.ceil(j.qty / n))]));
  const ones = arrange(S, group, upsFor(maxQty));
  if (!ones) return null;

  let lo = 1;
  let hi = maxQty;
  let best = { n: maxQty, p: ones };
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const p = arrange(S, group, upsFor(mid));
    if (p) {
      best = { n: mid, p };
      hi = mid;
    } else lo = mid + 1;
  }
  // the packer is a heuristic, so check a few smaller run lengths too
  for (let n = Math.max(1, best.n - 3); n < best.n; n++) {
    const p = arrange(S, group, upsFor(n));
    if (p) {
      best = { n, p };
      break;
    }
  }

  const ups = upsFor(best.n);
  const trim = best.p.reduce((t, p) => {
    const j = group.find((g) => g.id === p.jobId)!;
    return t + j.w * j.h;
  }, 0);
  return {
    id,
    jobIds: group.map((j) => j.id),
    placements: best.p,
    ups,
    sheets: best.n,
    printed: Object.fromEntries(group.map((j) => [j.id, ups[j.id] * best.n])),
    hasBack: group.some((j) => j.pages >= 2),
    utilisation: trim / (S.sheetW * S.sheetH),
  };
}

const area = (S: Settings, j: Job) => {
  const c = cell(S, j);
  return c.w * c.h;
};

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

/** Gang run: merge jobs onto shared sheets whenever that lowers the total cost. */
function planGang(S: Settings, jobs: Job[]): { sets: SheetSet[]; unplaced: string[] } {
  const map = new Map(jobs.map((j) => [j.id, j]));
  const costOf = (s: SheetSet) => setCost(S, s, map).total;
  const groups: { jobs: Job[]; set: SheetSet }[] = [];
  const unplaced: string[] = [];

  for (const j of [...jobs].sort((a, b) => area(S, b) - area(S, a))) {
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

function finish(S: Settings, mode: "step" | "gang", jobs: Job[], r: { sets: SheetSet[]; unplaced: string[] }): Plan {
  const map = new Map(jobs.map((j) => [j.id, j]));
  const costs = r.sets.map((s) => setCost(S, s, map));
  return { mode, sets: r.sets, costs, total: costs.reduce((t, c) => t + c.total, 0), ratio: effectiveRatio(S), unplaced: r.unplaced };
}

/** Build the imposition and cost plan for all jobs that have a quantity. */
export function makePlan(S: Settings, allJobs: Job[]): Plan {
  const jobs = allJobs.filter((j) => j.qty > 0 && j.w > 0 && j.h > 0);
  if (S.mode === "step") return finish(S, "step", jobs, planStep(S, jobs));
  if (S.mode === "gang") return finish(S, "gang", jobs, planGang(S, jobs));
  const a = finish(S, "step", jobs, planStep(S, jobs));
  const b = finish(S, "gang", jobs, planGang(S, jobs));
  if (b.unplaced.length < a.unplaced.length) return b;
  if (a.unplaced.length < b.unplaced.length) return a;
  return b.total < a.total - 1e-9 ? b : a;
}
