/** All sizes are in millimetres; layout coordinates are y-down from the top-left of the press sheet. */

export interface Job {
  id: string;
  name: string;
  /** Trim size of the first page. */
  w: number;
  h: number;
  pages: number;
  qty: number;
  /** Copies of this job on one press sheet, entered by the user. */
  ups: number;
  /** Optional: copies per row (0 = let the program choose the grid). */
  cols: number;
}

/** step = every job on its own sheet; gang = jobs share sheets when that is cheaper. */
export type PlanMode = "step" | "gang";

/** auto = the press sheet is cut from the parent sheet to fit the ups; fixed = always the sheet size below. */
export type SheetMode = "auto" | "fixed";

export interface Settings {
  /** Ups on every sheet: copies across (columns) x copies down (rows), typed by the user. */
  upsCols: number;
  upsRows: number;
  sheetMode: SheetMode;
  // press sheet (in "auto" mode these are the largest sheet the machine takes)
  sheetW: number;
  sheetH: number;
  /** Smallest sheet the machine can feed (auto mode never cuts below this). */
  minSheetW: number;
  minSheetH: number;
  /** Unprintable gripper edge at the top of the sheet. */
  gripper: number;
  marginSide: number;
  marginBottom: number;
  /** Height of the colour-bar / slug strip kept free at the bottom. */
  barH: number;
  bleed: number;
  /** Extra space between neighbouring cells (beyond the bleed). */
  gutter: number;
  allowRotate: boolean;
  mode: PlanMode;
  // paper
  parentW: number;
  parentH: number;
  parentPrice: number;
  /** Press sheets cut from one parent sheet; 0 = work it out from the sizes. */
  ratio: number;
  spoilSheets: number;
  spoilPct: number;
  // plates and machine
  colorsFront: number;
  colorsBack: number;
  plateCost: number;
  makeReadyPerPlate: number;
  runPer1000: number;
  // finishing and margins
  finishFixed: number;
  finishPer1000: number;
  overheadPct: number;
  profitPct: number;
  currency: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement {
  jobId: string;
  /** Cell including bleed, as placed on the sheet (already rotated if `rot`). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when the artwork is turned 90 degrees clockwise. */
  rot: boolean;
}

export interface SheetSet {
  id: number;
  /** Press sheet used by this set (cut from the parent sheet) and how many such sheets one parent gives. */
  sheetW: number;
  sheetH: number;
  ratio: number;
  jobIds: string[];
  placements: Placement[];
  ups: Record<string, number>;
  /** Good sheets to print (before spoilage). */
  sheets: number;
  /** Copies delivered per job (ups x sheets). */
  printed: Record<string, number>;
  hasBack: boolean;
  /** Trim area of all placements as a share of the press sheet (0..1). */
  utilisation: number;
}

export interface JobCost {
  jobId: string;
  cost: number;
  perPiece: number;
  ups: number;
  printed: number;
  surplus: number;
}

export interface SetCost {
  setId: number;
  sheetsBought: number;
  parentSheets: number;
  paper: number;
  plates: number;
  plateCount: number;
  machine: number;
  finishing: number;
  subtotal: number;
  overhead: number;
  profit: number;
  total: number;
  jobs: JobCost[];
}

export interface Plan {
  mode: "step" | "gang";
  sets: SheetSet[];
  costs: SetCost[];
  total: number;
  unplaced: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  upsCols: 3,
  upsRows: 6,
  sheetMode: "auto",
  sheetW: 584,
  sheetH: 914,
  minSheetW: 280,
  minSheetH: 400,
  gripper: 12,
  marginSide: 6,
  marginBottom: 6,
  barH: 10,
  bleed: 3,
  gutter: 0,
  allowRotate: true,
  mode: "step",
  parentW: 584,
  parentH: 914,
  parentPrice: 40,
  ratio: 0,
  spoilSheets: 50,
  spoilPct: 3,
  colorsFront: 4,
  colorsBack: 4,
  plateCost: 450,
  makeReadyPerPlate: 150,
  runPer1000: 400,
  finishFixed: 0,
  finishPer1000: 0,
  overheadPct: 10,
  profitPct: 15,
  currency: "৳",
};
