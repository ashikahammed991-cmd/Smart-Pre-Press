/** All sizes are in millimetres; layout coordinates are y-down from the top-left of the press sheet. */

export interface Job {
  id: string;
  name: string;
  /** Trim size of the first page. */
  w: number;
  h: number;
  pages: number;
  qty: number;
}

export type PlanMode = "auto" | "step" | "gang";

export interface Settings {
  // press sheet
  sheetW: number;
  sheetH: number;
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
  ratio: number;
  unplaced: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  sheetW: 584,
  sheetH: 914,
  gripper: 12,
  marginSide: 6,
  marginBottom: 6,
  barH: 10,
  bleed: 3,
  gutter: 0,
  allowRotate: true,
  mode: "auto",
  parentW: 584,
  parentH: 914,
  parentPrice: 40,
  ratio: 1,
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
