import "./style.css";
import { effectiveRatio, autoRatio } from "./engine/cost";
import { cutMarks, makePlan, printArea, withSheet } from "./engine/plan";
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
let tab = 0;
let side: "front" | "back" = "front";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem("spp-settings-v4");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}
function saveSettings(): void {
  try {
    localStorage.setItem("spp-settings-v4", JSON.stringify(settings));
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
}
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
      { key: "gutter", label: "Gap between jobs", unit: "mm" },
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

function buildSettings(): void {
  const root = $("settings");
  root.innerHTML = "";
  for (const sec of SECTIONS) {
    const h = document.createElement("h3");
    h.textContent = sec.title;
    root.appendChild(h);
    for (const f of sec.fields) {
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
        input.step = "any";
        input.min = "0";
        input.id = `s-${f.key}`;
        input.value = String(settings[f.key]);
        input.addEventListener("input", () => {
          const v = Number((input as HTMLInputElement).value);
          if (Number.isFinite(v) && v >= 0) {
            (settings[f.key] as number) = v;
            changed();
          }
        });
      }
      row.append(lab, input);
      root.appendChild(row);
    }
  }
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
function changed(rebuildNow = true): void {
  saveSettings();
  window.clearTimeout(timer);
  timer = window.setTimeout(recompute, rebuildNow ? 120 : 250);
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
  if (plan && tab >= plan.sets.length) tab = 0;
  renderResults();
}

function renderResults(): void {
  const warn = $("warnings");
  const summary = $("summary");
  const tabs = $("tabs");
  const tables = $("tables");
  warn.innerHTML = "";
  summary.innerHTML = "";
  tabs.innerHTML = "";
  tables.innerHTML = "";
  const svg = $("preview") as unknown as SVGSVGElement;
  svg.innerHTML = "";

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
  if (Math.floor(settings.upsCols) * Math.floor(settings.upsRows) <= 0) addWarn("Type the ups (columns × rows) above the job list.", true);
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
  const plates = plan.costs.reduce((t, c) => t + c.plateCount, 0);
  const pieces = jobs.filter((j) => j.qty > 0).reduce((t, j) => t + j.qty, 0);
  const card = (k: string, v: string) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  summary.innerHTML =
    card("Total cost", money(plan.total)) +
    card("Cost per piece", pieces ? money(plan.total / pieces) : "–") +
    card("Layout", plan.mode === "gang" ? "Gang run" : "Step & repeat") +
    card("Sheet sets", String(plan.sets.length)) +
    card("Press sheets to buy", int(bought)) +
    card("Parent sheets", int(plan.costs.reduce((t, c) => t + c.parentSheets, 0))) +
    card("Plates", String(plates));

  // tabs
  plan.sets.forEach((s, i) => {
    const b = document.createElement("button");
    b.textContent = `Set ${s.id}`;
    b.className = i === tab ? "on" : "";
    b.addEventListener("click", () => {
      tab = i;
      renderResults();
    });
    tabs.appendChild(b);
  });
  const cur = plan.sets[tab];
  if (cur.hasBack) {
    const sep = document.createElement("span");
    sep.className = "sep";
    tabs.appendChild(sep);
    for (const sd of ["front", "back"] as const) {
      const b = document.createElement("button");
      b.textContent = sd === "front" ? "Front" : "Back (turned)";
      b.className = side === sd ? "on" : "";
      b.addEventListener("click", () => {
        side = sd;
        renderResults();
      });
      tabs.appendChild(b);
    }
  } else side = "front";

  drawPreview(svg, cur, side === "back" && cur.hasBack);

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
    out += `<rect x="${c.x + S.bleed}" y="${c.y + S.bleed}" width="${Math.max(0, c.w - 2 * S.bleed)}" height="${Math.max(0, c.h - 2 * S.bleed)}" fill="none" stroke="#111" stroke-width="0.6"/>`;
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
  const rows: (string | number)[][] = [["Set", "Job", "Width mm", "Height mm", "Qty", "Ups", "Sheets run", "Printed", "Extra", "Job cost", "Per piece"]];
  const byId = new Map(jobs.map((j) => [j.id, j]));
  plan.sets.forEach((s, i) => {
    for (const jc of plan!.costs[i].jobs) {
      const j = byId.get(jc.jobId);
      rows.push([s.id, jc.jobId, j?.w ?? "", j?.h ?? "", j?.qty ?? "", jc.ups, s.sheets, jc.printed, jc.surplus, jc.cost.toFixed(2), jc.perPiece.toFixed(4)]);
    }
  });
  rows.push([]);
  rows.push(["Set", "Sheet mm", "Ratio", "Sheets run", "Sheets to buy", "Plates", "Paper", "Plates cost", "Machine", "Finishing", "Overhead", "Profit", "Total"]);
  plan.sets.forEach((s, i) => {
    const c = plan!.costs[i];
    rows.push([s.id, `${Math.round(s.sheetW)}x${Math.round(s.sheetH)}`, s.ratio, s.sheets, c.sheetsBought, c.plateCount, c.paper.toFixed(2), c.plates.toFixed(2), c.machine.toFixed(2), c.finishing.toFixed(2), c.overhead.toFixed(2), c.profit.toFixed(2), c.total.toFixed(2)]);
  });
  rows.push(["Grand total", "", "", "", "", "", "", "", "", "", "", "", plan.total.toFixed(2)]);
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
const upsCols = $<HTMLInputElement>("ups-cols");
const upsRows = $<HTMLInputElement>("ups-rows");
upsCols.value = String(settings.upsCols);
upsRows.value = String(settings.upsRows);
upsCols.addEventListener("input", () => {
  settings.upsCols = Math.max(0, Math.floor(Number(upsCols.value) || 0));
  changed();
});
upsRows.addEventListener("input", () => {
  settings.upsRows = Math.max(0, Math.floor(Number(upsRows.value) || 0));
  changed();
});
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
  changed();
});
$("btn-csv").addEventListener("click", () => void exportCsv());
$("btn-pdf").addEventListener("click", () => void exportPdf());
$("btn-reset").addEventListener("click", () => {
  settings = { ...DEFAULT_SETTINGS };
  upsCols.value = String(settings.upsCols);
  upsRows.value = String(settings.upsRows);
  buildSettings();
  changed();
});

buildSettings();
renderJobs();
recompute();
