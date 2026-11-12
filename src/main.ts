import "./style.css";
import { initLicenseUi } from "./licenseui";
import { effectiveRatio, autoRatio } from "./engine/cost";
import { cutMarks, geom, makePlan, printArea, withSheet } from "./engine/plan";
import { DEFAULT_SETTINGS } from "./engine/types";
import type { Job, Placement, Plan, Settings, SheetSet } from "./engine/types";
import { saveBytes, saveText } from "./io";
import { buildImposedPdf, readPdfInfo } from "./pdfio";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// ---------- state ----------
let settings: Settings = loadSettings();
const jobs: Job[] = [];
const sources = new Map<string, Uint8Array>();
let plan: Plan | null = null;

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem("spp-settings-v5");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}
function saveSettings(): void {
  try {
    localStorage.setItem("spp-settings-v5", JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

const setStatus = (m: string) => ($("status").textContent = m);
const money = (v: number) => `${settings.currency}${v.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const int = (v: number) => Math.round(v).toLocaleString();
const hue = (i: number) => (i * 67 + 200) % 360;

// ---------- settings panel ----------
interface Field {
  key: keyof Settings;
  label: string;
  unit?: string;
  kind?: "num" | "bool" | "text" | "mode" | "sheetmode" | "priority";
  /** Whole numbers only. */
  int?: boolean;
}

/** The settings that are always visible (same as the Illustrator plate dialog); the rest sit under "Advanced". */
const PRIMARY: Field[] = [
  { key: "upsRows", label: "Rows (Downwards)", int: true },
  { key: "upsCols", label: "Columns (Rightwards)", int: true },
  { key: "gapX", label: "Horizontal GAP", unit: "mm" },
  { key: "gapY", label: "Vertical GAP", unit: "mm" },
  { key: "markLen", label: "Cutting Mark LENGTH", unit: "mm" },
  { key: "markGap", label: "Cutting Mark GAP", unit: "mm" },
  { key: "maxWastePct", label: "Max paper waste", unit: "%" },
];
const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "Mode",
    fields: [
      { key: "mode", label: "PDFs", kind: "mode" },
      { key: "priority", label: "Combine for", kind: "priority" },
      { key: "sheetMode", label: "Press sheet", kind: "sheetmode" },
      { key: "allowRotate", label: "Allow 90° rotation", kind: "bool" },
    ],
  },
  {
    title: "Press sheet",
    fields: [
      { key: "sheetW", label: "Width (max in auto)", unit: "mm" },
      { key: "sheetH", label: "Height (max in auto)", unit: "mm" },
      { key: "minSheetW", label: "Smallest sheet width", unit: "mm" },
      { key: "minSheetH", label: "Smallest sheet height", unit: "mm" },
      { key: "gripper", label: "Gripper edge (top)", unit: "mm" },
      { key: "marginSide", label: "Side margins", unit: "mm" },
      { key: "marginBottom", label: "Bottom margin", unit: "mm" },
      { key: "barH", label: "Colour-bar strip", unit: "mm" },
      { key: "bleed", label: "Bleed", unit: "mm" },
    ],
  },
  {
    title: "Paper and ratio",
    fields: [
      { key: "parentW", label: "Parent sheet width", unit: "mm" },
      { key: "parentH", label: "Parent sheet height", unit: "mm" },
      { key: "parentPrice", label: "Price per parent sheet" },
      { key: "ratio", label: "Ratio (0 = auto)", unit: "per parent" },
      { key: "spoilSheets", label: "Make-ready sheets / set", unit: "sheets" },
      { key: "spoilPct", label: "Spoilage", unit: "%" },
    ],
  },
  {
    title: "Plates and machine",
    fields: [
      { key: "colorsFront", label: "Colours front", unit: "plates" },
      { key: "colorsBack", label: "Colours back", unit: "plates" },
      { key: "plateCost", label: "Cost per plate" },
      { key: "makeReadyPerPlate", label: "Make-ready per plate" },
      { key: "runPer1000", label: "Run cost per 1000 impr." },
    ],
  },
  {
    title: "Finishing and margin",
    fields: [
      { key: "finishFixed", label: "Finishing (fixed)" },
      { key: "finishPer1000", label: "Finishing per 1000 sheets" },
      { key: "overheadPct", label: "Overhead", unit: "%" },
      { key: "profitPct", label: "Profit", unit: "%" },
      { key: "currency", label: "Currency symbol", kind: "text" },
    ],
  },
];

function renderField(parent: HTMLElement, f: Field): void {
  const row = document.createElement("div");
  row.className = "row" + (f.kind === "bool" ? " check" : "");
  const lab = document.createElement("label");
  lab.textContent = f.label + (f.unit ? ` (${f.unit})` : "");
  let input: HTMLInputElement | HTMLSelectElement;
  if (f.kind === "mode") {
    input = document.createElement("select");
    input.innerHTML = `<option value="gang">Combine into shared plates</option><option value="step">Each PDF on its own plates</option>`;
    input.value = settings.mode === "step" ? "step" : "gang";
    input.addEventListener("change", () => {
      settings.mode = (input as HTMLSelectElement).value as Settings["mode"];
      changed();
    });
  } else if (f.kind === "priority") {
    input = document.createElement("select");
    input.innerHTML = `<option value="plates">Fewest plates (more sheets are fine)</option><option value="cost">Lowest total cost</option>`;
    input.value = settings.priority;
    input.addEventListener("change", () => {
      settings.priority = (input as HTMLSelectElement).value as Settings["priority"];
      changed();
    });
  } else if (f.kind === "sheetmode") {
    input = document.createElement("select");
    input.innerHTML = `<option value="auto">Auto: cut to fit the ups</option><option value="fixed">Fixed size</option>`;
    input.value = settings.sheetMode;
    input.addEventListener("change", () => {
      settings.sheetMode = (input as HTMLSelectElement).value as Settings["sheetMode"];
      changed();
    });
  } else if (f.kind === "bool") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!settings[f.key];
    input.addEventListener("change", () => {
      (settings[f.key] as boolean) = (input as HTMLInputElement).checked;
      changed();
    });
  } else if (f.kind === "text") {
    input = document.createElement("input");
    input.type = "text";
    input.value = String(settings[f.key]);
    input.addEventListener("input", () => {
      (settings[f.key] as string) = (input as HTMLInputElement).value;
      changed();
    });
  } else {
    input = document.createElement("input");
    input.type = "number";
    input.step = f.int ? "1" : "any";
    input.min = "0";
    input.id = `s-${f.key}`;
    input.value = String(settings[f.key]);
    input.addEventListener("input", () => {
      const v = Number((input as HTMLInputElement).value);
      if (Number.isFinite(v) && v >= 0) {
        (settings[f.key] as number) = f.int ? Math.floor(v) : v;
        changed();
      }
    });
  }
  row.append(lab, input);
  parent.appendChild(row);
}

function buildSettings(): void {
  const root = $("settings");
  root.innerHTML = "";
  const title = document.createElement("div");
  title.className = "plate-title";
  title.textContent = "Plate layout settings";
  root.appendChild(title);
  for (const f of PRIMARY) renderField(root, f);
  const total = document.createElement("div");
  total.className = "ups-line";
  total.innerHTML = `UPS: <b id="ups-total">0</b>`;
  root.appendChild(total);

  const adv = document.createElement("details");
  adv.className = "advanced";
  const sum = document.createElement("summary");
  sum.textContent = "Advanced (sheet sizes, paper, plates, costing)";
  adv.appendChild(sum);
  for (const sec of SECTIONS) {
    const h = document.createElement("h3");
    h.textContent = sec.title;
    adv.appendChild(h);
    for (const f of sec.fields) renderField(adv, f);
  }
  root.appendChild(adv);
  const note = document.createElement("div");
  note.className = "hint";
  note.id = "ratio-note";
  root.appendChild(note);
}

// ---------- jobs panel ----------
function renderJobs(): void {
  const body = document.querySelector<HTMLTableSectionElement>("#jobs tbody")!;
  body.innerHTML = "";
  $("jobs-empty").style.display = jobs.length ? "none" : "block";
  $("jobs").style.display = jobs.length ? "table" : "none";
  jobs.forEach((j, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="name" title="${esc(j.name)}"><span class="swatch" style="background:hsl(${hue(i)} 65% 55%)"></span>${esc(j.name)}</td><td>${j.w} × ${j.h}</td><td>${j.pages}</td><td><input type="number" min="0" step="1" value="${j.qty}" data-id="${esc(j.id)}" /></td><td><button class="x" data-del="${esc(j.id)}" title="Remove">✕</button></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll<HTMLInputElement>("input[data-id]").forEach((el) =>
    el.addEventListener("input", () => {
      const j = jobs.find((x) => x.id === el.dataset.id);
      if (j) {
        j.qty = Math.max(0, Math.floor(Number(el.value) || 0));
        changed(false);
      }
    }),
  );
  body.querySelectorAll<HTMLButtonElement>("button[data-del]").forEach((el) =>
    el.addEventListener("click", () => {
      const k = jobs.findIndex((x) => x.id === el.dataset.del);
      if (k >= 0) {
        sources.delete(jobs[k].id);
        jobs.splice(k, 1);
        renderJobs();
        changed();
      }
    }),
  );
  const total = jobs.reduce((t, j) => t + j.qty, 0);
  $("jobs-total").textContent = jobs.length ? `${jobs.length} job${jobs.length === 1 ? "" : "s"}, ${int(total)} pieces in total` : "";
}

async function addFiles(files: File[]): Promise<void> {
  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!pdfs.length) {
    setStatus("No PDF files found");
    return;
  }
  const failed: string[] = [];
  for (const f of pdfs) {
    try {
      setStatus(`Reading ${f.name}…`);
      const bytes = new Uint8Array(await f.arrayBuffer());
      const info = await readPdfInfo(bytes);
      const base = f.name.replace(/\.pdf$/i, "");
      let id = base;
      for (let n = 2; jobs.some((j) => j.id === id); n++) id = `${base} (${n})`;
      jobs.push({ id, name: id, w: info.w, h: info.h, pages: info.pages, qty: 1000, ups: 0, cols: 0 });
      sources.set(id, bytes);
    } catch (err) {
      failed.push(`${f.name}: ${(err as Error).message}`);
    }
  }
  renderJobs();
  changed();
  setStatus(failed.length ? `Could not read ${failed.length} file(s): ${failed.join("; ")}` : `Added ${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"}`);
}

// ---------- planning and results ----------
let timer = 0;
function changed(_rebuildNow = true): void {
  saveSettings();
  window.clearTimeout(timer);
  timer = window.setTimeout(markStale, 60);
}

let stale = false;
/** Inputs changed after a run: keep the plates on screen but say they are out of date. */
function markStale(): void {
  const totalEl = document.getElementById("ups-total");
  if (totalEl) totalEl.textContent = String(Math.max(0, Math.floor(settings.upsCols)) * Math.max(0, Math.floor(settings.upsRows)));
  stale = !!plan;
  $("btn-pdf").toggleAttribute("disabled", !plan || stale);
  $("btn-csv").toggleAttribute("disabled", !plan || stale);
  $("stale").style.display = stale ? "block" : "none";
  $("btn-run").classList.toggle("primary", true);
  if (stale) setStatus("Settings changed – press Run to update the plates");
}

/** The jobs as the planner sees them (the ups are shared out by the planner, see engine/plan.ts). */
function planJobs(): Job[] {
  return jobs.map((j) => ({ ...j }));
}

function recompute(): void {
  const totalEl = document.getElementById("ups-total");
  if (totalEl) totalEl.textContent = String(Math.max(0, Math.floor(settings.upsCols)) * Math.max(0, Math.floor(settings.upsRows)));
  const ratioNote = $("ratio-note");
  const auto = autoRatio(settings);
  ratioNote.textContent =
    settings.sheetMode === "auto"
      ? `Auto: the press sheet is cut from the ${settings.parentW} × ${settings.parentH} mm parent sheet, as small as the ups allow, and never larger than ${settings.sheetW} × ${settings.sheetH} mm. Type a ratio above to force one.`
      : `Fixed sheet: ratio ${effectiveRatio(settings)} press sheet${effectiveRatio(settings) === 1 ? "" : "s"} per parent sheet (automatic would be ${auto}).`;
  try {
    plan = makePlan(settings, planJobs());
  } catch (err) {
    plan = null;
    setStatus(`Planning failed: ${(err as Error).message}`);
  }
  stale = false;
  $("stale").style.display = "none";
  renderResults();
}

function renderResults(): void {
  const warn = $("warnings");
  const summary = $("summary");
  const tables = $("tables");
  warn.innerHTML = "";
  summary.innerHTML = "";
  $("boards").innerHTML = "";
  $("show-prev").parentElement!.style.display = "none";
  $("boards").style.display = ($("show-prev") as HTMLInputElement).checked ? "flex" : "none";
  tables.innerHTML = "";

  const addWarn = (t: string, bad = false) => {
    const d = document.createElement("div");
    d.className = "w" + (bad ? " bad" : "");
    d.textContent = t;
    warn.appendChild(d);
  };
  const A = printArea(settings);
  if (A.W <= 0 || A.H <= 0) addWarn("The margins leave no printable area on the press sheet.", true);
  const noQty = jobs.filter((j) => j.qty <= 0).map((j) => j.name);
  if (noQty.length) addWarn(`No quantity entered for: ${noQty.join(", ")}`);
  if (Math.floor(settings.upsCols) * Math.floor(settings.upsRows) <= 0) addWarn("Type the Rows and Columns in the plate layout settings.", true);
  if (!plan || !plan.sets.length) {
    if (plan?.unplaced.length) addWarn(`${settings.upsCols} × ${settings.upsRows} ups do not fit on the largest sheet (with bleed and margins) for: ${plan.unplaced.join(", ")}`, true);
    $("btn-pdf").toggleAttribute("disabled", true);
    $("btn-csv").toggleAttribute("disabled", true);
    return;
  }
  if (plan.unplaced.length) addWarn(`${settings.upsCols} × ${settings.upsRows} ups do not fit on the largest sheet (with bleed and margins), left out: ${plan.unplaced.join(", ")}`, true);
  const wide = jobs.filter((j) => j.pages > 2).map((j) => j.name);
  if (wide.length) addWarn(`Only pages 1 and 2 (front / back) are used for: ${wide.join(", ")}`);
  $("btn-pdf").toggleAttribute("disabled", false);
  $("btn-csv").toggleAttribute("disabled", false);

  const bought = plan.costs.reduce((t, c) => t + c.sheetsBought, 0);
  const pieces = jobs.filter((j) => j.qty > 0).reduce((t, j) => t + j.qty, 0);
  const card = (k: string, v: string) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  summary.innerHTML =
    card("Total cost", money(plan.total)) +
    card("Cost per piece", pieces ? money(plan.total / pieces) : "–") +
    card("Layout", plan.mode === "gang" ? "Gang run" : "Step & repeat") +
    card("Sheet sets", String(plan.sets.length)) +
    card("Plates", String(plan.sets.reduce((t, x) => t + (x.hasBack ? 2 : 1), 0))) +
    card("Press sheets to buy", int(bought)) +
    card("Parent sheets", int(plan.costs.reduce((t, c) => t + c.parentSheets, 0)));

  // artboards: one per sheet side, exactly the pages of the exported PDF
  const boards = $("boards");
  $("show-prev").parentElement!.style.display = "flex";
  let n = 0;
  for (const set of plan.sets) {
    for (const sd of set.hasBack ? (["front", "back"] as const) : (["front"] as const)) {
      n++;
      const card = document.createElement("div");
      card.className = "board";
      const head = document.createElement("div");
      head.className = "bh";
      head.textContent = `Plate ${n} – Set ${set.id} ${set.hasBack ? (sd === "front" ? "front" : "back (turned)") : ""} – ${Math.round(set.sheetW)} × ${Math.round(set.sheetH)} mm – ratio ${set.ratio} – ${int(set.sheets)} sheets`;
      const sv = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      sv.setAttribute("class", "bsvg");
      drawPreview(sv as SVGSVGElement, set, sd === "back");
      card.appendChild(head);
      card.appendChild(sv);
      boards.appendChild(card);
    }
  }

  // tables
  const jobById = new Map(jobs.map((j, i) => [j.id, { j, i }]));
  let html = `<h3>Sheet sets</h3><table><thead><tr><th>Set</th><th>Jobs</th><th>Ups</th><th>Sheet mm</th><th class="num">Ratio</th><th class="num">Sheets</th><th class="num">Buy</th><th class="num">Plates</th><th class="num">Paper</th><th class="num">Plates</th><th class="num">Machine</th><th class="num">Finish</th><th class="num">Overhead + profit</th><th class="num">Total</th><th class="num">Fill</th></tr></thead><tbody>`;
  plan.sets.forEach((s, i) => {
    const c = plan!.costs[i];
    html += `<tr><td>${s.id}</td><td>${s.jobIds.map((id) => esc(id)).join(", ")}</td><td>${s.jobIds.map((id) => s.ups[id]).join(" + ")}</td><td>${Math.round(s.sheetW)} × ${Math.round(s.sheetH)}</td><td class="num">${s.ratio}</td><td class="num">${int(s.sheets)}</td><td class="num">${int(c.sheetsBought)}</td><td class="num">${c.plateCount}</td><td class="num">${money(c.paper)}</td><td class="num">${money(c.plates)}</td><td class="num">${money(c.machine)}</td><td class="num">${money(c.finishing)}</td><td class="num">${money(c.overhead + c.profit)}</td><td class="num"><b>${money(c.total)}</b></td><td class="num">${Math.round(s.utilisation * 100)}%</td></tr>`;
  });
  html += `</tbody></table><h3>Jobs</h3><table><thead><tr><th>Job</th><th>Set</th><th class="num">Qty</th><th class="num">Ups</th><th class="num">Printed</th><th class="num">Extra</th><th class="num">Cost</th><th class="num">Per piece</th></tr></thead><tbody>`;
  plan.sets.forEach((s, i) => {
    for (const jc of plan!.costs[i].jobs) {
      const e = jobById.get(jc.jobId);
      html += `<tr><td><span class="swatch" style="background:hsl(${hue(e?.i ?? 0)} 65% 55%)"></span>${esc(jc.jobId)}</td><td>${s.id}</td><td class="num">${int(e?.j.qty ?? 0)}</td><td class="num">${jc.ups}</td><td class="num">${int(jc.printed)}</td><td class="num">${int(jc.surplus)}</td><td class="num">${money(jc.cost)}</td><td class="num">${money(jc.perPiece)}</td></tr>`;
    }
  });
  html += "</tbody></table>";
  tables.innerHTML = html;
  setStatus(`${plan.sets.length} sheet set${plan.sets.length === 1 ? "" : "s"}, total ${money(plan.total)}`);
}

function drawPreview(svg: SVGSVGElement, set: SheetSet, mirror: boolean): void {
  const S = withSheet(settings, set);
  svg.setAttribute("viewBox", `0 0 ${S.sheetW} ${S.sheetH}`);
  const A = printArea(S);
  const gm = geom(S);
  const jobIndex = new Map(jobs.map((j, i) => [j.id, i]));
  const cells: Placement[] = set.placements.map((p) => (mirror ? { ...p, x: S.sheetW - p.x - p.w } : p));
  let out = `<rect x="0" y="0" width="${S.sheetW}" height="${S.sheetH}" fill="#fff"/>`;
  out += `<rect x="${A.x0}" y="${A.y0}" width="${A.W}" height="${A.H}" fill="none" stroke="#9aa" stroke-width="0.8" stroke-dasharray="4 3"/>`;
  out += `<rect x="0" y="0" width="${S.sheetW}" height="${S.gripper}" fill="#e8e8ee"/>`;
  for (const c of cells) {
    const i = jobIndex.get(c.jobId) ?? 0;
    const job = jobs[i];
    const blank = mirror && job && job.pages < 2;
    const col = `hsl(${hue(i)} 65% 60%)`;
    out += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${blank ? "#f4f4f4" : col}" fill-opacity="0.55" stroke="${col}" stroke-width="0.5"/>`;
    out += `<rect x="${c.x + gm.bx}" y="${c.y + gm.by}" width="${Math.max(0, c.w - 2 * gm.bx)}" height="${Math.max(0, c.h - 2 * gm.by)}" fill="none" stroke="#111" stroke-width="0.6"/>`;
    const fs = Math.max(4, Math.min(c.w, c.h) / 7);
    if (c.w > 14 && c.h > 14) out += `<text x="${c.x + c.w / 2}" y="${c.y + c.h / 2}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="#111" ${c.rot ? `transform="rotate(90 ${c.x + c.w / 2} ${c.y + c.h / 2})"` : ""}>${esc(c.jobId.slice(0, 14))}</text>`;
  }
  // cut marks: vertical ticks for vertical cuts (top, bottom), horizontal ticks for horizontal cuts (left, right)
  const marks = cutMarks(S, cells)
    .map((g) => `M${g.x1} ${g.y1}L${g.x2} ${g.y2}`)
    .join("");
  out += `<path d="${marks}" fill="none" stroke="#c0152f" stroke-width="0.4"/>`;
  out += `<text x="${S.sheetW / 2}" y="${S.gripper - 3}" font-size="7" text-anchor="middle" fill="#555">GRIPPER – ${Math.round(S.sheetW)} × ${Math.round(S.sheetH)} mm – ratio ${set.ratio}</text>`;
  svg.innerHTML = out;
}

// ---------- export ----------
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCsv(): Promise<void> {
  if (!plan) return;
  const rows: (string | number)[][] = [["Plate no", "Size", "Quantity", "Ups", "Sheet run", "Printed", "Extra"]];
  const byId = new Map(jobs.map((j) => [j.id, j]));
  plan.sets.forEach((s, i) => {
    let q = 0;
    let u = 0;
    let pr = 0;
    let ex = 0;
    for (const jc of plan!.costs[i].jobs) {
      const qty = byId.get(jc.jobId)?.qty ?? 0;
      rows.push([s.id, jc.jobId, qty, jc.ups, s.sheets, jc.printed, jc.surplus]);
      q += qty;
      u += jc.ups;
      pr += jc.printed;
      ex += jc.surplus;
    }
    rows.push([s.id, "Total", q, u, s.sheets, pr, ex]);
    rows.push([]);
  });
  const text = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  if (await saveText("costing.csv", text, "csv", "CSV")) setStatus("Costing CSV saved");
}

async function exportPdf(): Promise<void> {
  if (!plan || !plan.sets.length) return;
  const btn = $("btn-pdf");
  btn.setAttribute("disabled", "");
  try {
    setStatus("Building plate PDF…");
    const bytes = await buildImposedPdf(settings, plan, jobs, sources, (m) => setStatus(`Building plate PDF… ${m}`));
    if (await saveBytes("imposed-plates.pdf", bytes, "pdf", "PDF")) setStatus(`Plate PDF saved (${plan.sets.length} set${plan.sets.length === 1 ? "" : "s"}, ${(bytes.length / 1048576).toFixed(1)} MB)`);
    else setStatus("Export cancelled");
  } catch (err) {
    setStatus(`PDF export failed: ${(err as Error).message}`);
  } finally {
    btn.removeAttribute("disabled");
  }
}

// ---------- wiring ----------

const filePdf = $<HTMLInputElement>("file-pdf");
const fileFolder = $<HTMLInputElement>("file-folder");
$("btn-add").addEventListener("click", () => filePdf.click());
$("btn-folder").addEventListener("click", () => fileFolder.click());
filePdf.addEventListener("change", () => {
  void addFiles(Array.from(filePdf.files ?? []));
  filePdf.value = "";
});
fileFolder.addEventListener("change", () => {
  void addFiles(Array.from(fileFolder.files ?? []));
  fileFolder.value = "";
});
$("btn-clear").addEventListener("click", () => {
  jobs.length = 0;
  sources.clear();
  renderJobs();
  plan = null;
  stale = false;
  $("stale").style.display = "none";
  renderResults();
});
$("show-prev").addEventListener("change", () => {
  $("boards").style.display = ($("show-prev") as HTMLInputElement).checked ? "flex" : "none";
});
$("btn-run").addEventListener("click", () => {
  window.clearTimeout(timer);
  recompute();
});
$("btn-csv").addEventListener("click", () => void exportCsv());
$("btn-pdf").addEventListener("click", () => void exportPdf());
$("btn-reset").addEventListener("click", () => {
  settings = { ...DEFAULT_SETTINGS };
  buildSettings();
  changed();
});

buildSettings();
renderJobs();
markStale();
renderResults();

// ---------- Vector Editor / Auto Plate switch ----------
{
  const app = $("app");
  const vcView = $("vc-view");
  const frame = $("vc-frame") as HTMLIFrameElement;
  let vcLoaded = false;
  const show = (view: "vector" | "plate") => {
    app.hidden = view !== "plate";
    vcView.hidden = view !== "vector";
    $("nav-vector").classList.toggle("on", view === "vector");
    $("nav-plate").classList.toggle("on", view === "plate");
    try {
      localStorage.setItem("spp-view", view);
    } catch {
      /* storage may be unavailable */
    }
    if (view === "vector" && !vcLoaded) {
      vcLoaded = true;
      // the editor is only loaded when first opened (the app is large), then kept alive while switching
      const miss = (why: string) => {
        $("vc-missing").hidden = false;
        $("vc-missing").textContent = `The Vector Editor could not be loaded (${why}).`;
      };
      fetch("vectorcraft/index.html")
        .then(async (r) => {
          const t = await r.text();
          if (r.ok && /vectorcraft-web|wasm/i.test(t) && !/id="nav-vector"/.test(t)) frame.src = "vectorcraft/index.html";
          else miss(`status ${r.status}, ${t.length} bytes, ${/id="nav-vector"/.test(t) ? "the app's own page came back, so the editor files are not in this build" : "unexpected content"}`);
        })
        .catch((e) => miss(String(e)));
    }
  };
  $("nav-vector").addEventListener("click", () => show("vector"));
  $("nav-plate").addEventListener("click", () => show("plate"));
  let first: "vector" | "plate" = "vector";
  try {
    if (localStorage.getItem("spp-view") === "plate") first = "plate";
  } catch {
    /* ignore */
  }
  show(first);
}
initLicenseUi();
