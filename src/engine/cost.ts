import type { Job, Settings, SetCost, SheetSet } from "./types";

/** How many press sheets can be cut from one parent sheet (straight cuts, either orientation). */
export function autoRatio(S: Settings): number {
  const a = Math.floor(S.parentW / S.sheetW) * Math.floor(S.parentH / S.sheetH);
  const b = Math.floor(S.parentW / S.sheetH) * Math.floor(S.parentH / S.sheetW);
  return Math.max(1, a, b);
}

export function effectiveRatio(S: Settings): number {
  return S.ratio > 0 ? S.ratio : autoRatio(S);
}

/** Press sheets to buy for a run of `sheets` good sheets, including make-ready and percentage spoilage. */
export function sheetsToBuy(S: Settings, sheets: number): number {
  return sheets + Math.max(0, S.spoilSheets) + Math.ceil((sheets * Math.max(0, S.spoilPct)) / 100);
}

/** Cost of one sheet set (paper, plates, machine, finishing, overhead, profit) split across its jobs. */
export function setCost(S: Settings, set: SheetSet, jobs: Map<string, Job>): SetCost {
  const bought = sheetsToBuy(S, set.sheets);
  const paper = (bought * S.parentPrice) / effectiveRatio(S);
  const plateCount = Math.max(0, S.colorsFront) + (set.hasBack ? Math.max(0, S.colorsBack) : 0);
  const plates = plateCount * S.plateCost;
  const impressions = bought * (set.hasBack ? 2 : 1);
  const machine = plateCount * S.makeReadyPerPlate + (impressions / 1000) * S.runPer1000;
  const finishing = S.finishFixed + (set.sheets / 1000) * S.finishPer1000;
  const subtotal = paper + plates + machine + finishing;
  const overhead = (subtotal * S.overheadPct) / 100;
  const profit = ((subtotal + overhead) * S.profitPct) / 100;
  const total = subtotal + overhead + profit;

  // Share the total by the sheet area each job occupies (area per copy x copies on the sheet).
  const weight = (id: string) => {
    const j = jobs.get(id);
    return j ? (j.w + 2 * S.bleed) * (j.h + 2 * S.bleed) * (set.ups[id] ?? 0) : 0;
  };
  const sum = set.jobIds.reduce((t, id) => t + weight(id), 0) || 1;
  return {
    setId: set.id,
    sheetsBought: bought,
    paper,
    plates,
    plateCount,
    machine,
    finishing,
    subtotal,
    overhead,
    profit,
    total,
    jobs: set.jobIds.map((id) => {
      const j = jobs.get(id);
      const cost = (total * weight(id)) / sum;
      const printed = set.printed[id] ?? 0;
      return { jobId: id, cost, perPiece: j && j.qty > 0 ? cost / j.qty : 0, ups: set.ups[id] ?? 0, printed, surplus: j ? printed - j.qty : 0 };
    }),
  };
}
