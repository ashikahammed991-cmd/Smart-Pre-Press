import "./style.css";
import { Editor, ToolName } from "./editor";
import { openText, saveBytes, saveText } from "./io";
import { Cmyk, clampCmyk, cmykToHex, hexToCmyk } from "./color";
import { mmToPx, pxToMm } from "./model";
import { docToPdf, pdfBytes } from "./pdf";
import { preflight } from "./preflight";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

const stage = $("stage") as unknown as SVGSVGElement;
const editor = new Editor(stage);

const status = $("status");
editor.onStatus = (m) => (status.textContent = m);

// ---------- tools ----------
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".tool"));
toolButtons.forEach((b) =>
  b.addEventListener("click", () => {
    editor.setTool(b.dataset.tool as ToolName);
  }),
);

// ---------- colours (RGB pickers + CMYK numbers) ----------
const fill = input("fill");
const stroke = input("stroke");
const strokeWidth = input("stroke-width");

const CH = ["c", "m", "y", "k"] as const;

function setCmykInputs(prefix: "f" | "s", c: Cmyk): void {
  CH.forEach((ch, i) => (input(prefix + ch).value = String(Math.round(c[i] * 100))));
}

function readCmyk(prefix: "f" | "s"): Cmyk {
  return clampCmyk(CH.map((ch) => Number(input(prefix + ch).value) / 100));
}

fill.addEventListener("input", () => {
  editor.setStyle({ fill: fill.value, fillCmyk: undefined });
  setCmykInputs("f", hexToCmyk(fill.value));
});
stroke.addEventListener("input", () => {
  editor.setStyle({ stroke: stroke.value, strokeCmyk: undefined });
  setCmykInputs("s", hexToCmyk(stroke.value));
});
strokeWidth.addEventListener("input", () => editor.setStyle({ strokeWidth: Number(strokeWidth.value) || 0 }));

(["f", "s"] as const).forEach((prefix) =>
  CH.forEach((ch) =>
    input(prefix + ch).addEventListener("input", () => {
      const c = readCmyk(prefix);
      const hex = cmykToHex(c);
      if (prefix === "f") {
        fill.value = hex;
        editor.setStyle({ fill: hex, fillCmyk: c });
      } else {
        stroke.value = hex;
        editor.setStyle({ stroke: hex, strokeCmyk: c });
      }
    }),
  ),
);

function toHex(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#000000";
}

function mirrorStyle(s: { fill: string; stroke: string; strokeWidth: number; fillCmyk?: Cmyk; strokeCmyk?: Cmyk }): void {
  fill.value = toHex(s.fill);
  stroke.value = toHex(s.stroke);
  strokeWidth.value = String(s.strokeWidth);
  setCmykInputs("f", s.fillCmyk ?? hexToCmyk(s.fill));
  setCmykInputs("s", s.strokeCmyk ?? hexToCmyk(s.stroke));
}
mirrorStyle(editor.style);

// ---------- document settings ----------
const docW = input("doc-w");
const docH = input("doc-h");
const docBleed = input("doc-bleed");
const docMarks = input("doc-marks");
const preset = $<HTMLSelectElement>("preset");
const round1 = (v: number) => String(Math.round(v * 10) / 10);

function syncDocInputs(): void {
  const active = document.activeElement;
  if (active !== docW) docW.value = round1(pxToMm(editor.doc.width));
  if (active !== docH) docH.value = round1(pxToMm(editor.doc.height));
  if (active !== docBleed) docBleed.value = round1(pxToMm(editor.doc.bleed ?? 0));
  docMarks.checked = !!editor.doc.cropMarks;
  const key = `${round1(pxToMm(editor.doc.width))}x${round1(pxToMm(editor.doc.height))}`;
  const known = Array.from(preset.options).some((o) => o.value === key);
  if (active !== preset) preset.value = known ? key : "custom";
}

function applySize(): void {
  const w = Number(docW.value);
  const h = Number(docH.value);
  if (w > 0 && h > 0) editor.setDocument({ width: mmToPx(w), height: mmToPx(h) });
  else syncDocInputs();
}

preset.addEventListener("change", () => {
  if (preset.value === "custom") return;
  const [w, h] = preset.value.split("x");
  docW.value = w;
  docH.value = h;
  applySize();
});
docW.addEventListener("change", applySize);
docH.addEventListener("change", applySize);
docBleed.addEventListener("change", () => {
  const v = Number(docBleed.value);
  if (v >= 0) editor.setDocument({ bleed: mmToPx(v) });
  else syncDocInputs();
});
docMarks.addEventListener("change", () => editor.setDocument({ cropMarks: docMarks.checked }));

// ---------- swatches ----------
const swatchBox = $("swatches");
let swatchKey = "";

function applyTarget(): "fill" | "stroke" {
  return document.querySelector<HTMLInputElement>('input[name="apply"]:checked')?.value === "stroke" ? "stroke" : "fill";
}

function renderSwatches(): void {
  const list = editor.swatches();
  const key = JSON.stringify(list);
  if (key === swatchKey) return;
  swatchKey = key;
  swatchBox.innerHTML = "";
  list.forEach((sw, i) => {
    const b = document.createElement("button");
    b.className = "swatch-btn";
    b.style.background = cmykToHex(sw.cmyk);
    const pct = sw.cmyk.map((v) => Math.round(v * 100));
    b.title = `${sw.name}  (C${pct[0]} M${pct[1]} Y${pct[2]} K${pct[3]})`;
    b.addEventListener("click", () => {
      const target = applyTarget();
      editor.applySwatch(i, target);
      const hex = cmykToHex(sw.cmyk);
      if (target === "fill") {
        fill.value = hex;
        setCmykInputs("f", sw.cmyk);
      } else {
        stroke.value = hex;
        setCmykInputs("s", sw.cmyk);
      }
    });
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      editor.removeSwatch(i);
    });
    swatchBox.appendChild(b);
  });
}
$("btn-add-swatch").addEventListener("click", () => editor.addSwatch(readCmyk(applyTarget() === "fill" ? "f" : "s")));

// ---------- preflight ----------
const pfList = $("preflight");
const pfBadge = $("pf-badge");
let pfKey = "";

function renderPreflight(): void {
  const issues = preflight(editor.doc);
  const key = JSON.stringify(issues);
  if (key === pfKey) return;
  pfKey = key;
  pfList.innerHTML = "";
  for (const it of issues) {
    const li = document.createElement("li");
    li.className = it.level;
    li.textContent = it.text;
    pfList.appendChild(li);
  }
  const errors = issues.filter((i) => i.level === "error").length;
  const warns = issues.filter((i) => i.level === "warn").length;
  pfBadge.className = `badge ${errors ? "bad" : warns ? "warn" : "good"}`;
  pfBadge.textContent = errors + warns > 0 ? String(errors + warns) : "OK";
}

// ---------- layers panel ----------
const layerList = $("layer-list");
let lastSelectedForProps: string | null = null;
let layerKey = "";

const SVG_ATTR = 'viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICON_EYE = `<svg ${SVG_ATTR}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_EYE_OFF = `<svg ${SVG_ATTR}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><path d="M3 3l18 18"/></svg>`;
const ICON_LOCK = `<svg ${SVG_ATTR}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
const ICON_UNLOCK = `<svg ${SVG_ATTR}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7-2.6"/></svg>`;

function iconButton(html: string, title: string, on: boolean, handler: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "icon-btn" + (on ? " on" : "");
  b.title = title;
  b.innerHTML = html;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    handler();
  });
  b.addEventListener("dblclick", (e) => e.stopPropagation());
  return b;
}

function startRename(nameEl: HTMLElement, id: string, current: string): void {
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "name-input";
  inp.value = current;
  let done = false;
  const commit = (save: boolean) => {
    if (done) return;
    done = true;
    const value = inp.value;
    inp.remove();
    layerKey = ""; // force the list to rebuild
    if (save) editor.renameShape(id, value);
    refreshUi();
  };
  inp.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") commit(true);
    else if (e.key === "Escape") commit(false);
  });
  inp.addEventListener("blur", () => commit(true));
  inp.addEventListener("click", (e) => e.stopPropagation());
  nameEl.replaceWith(inp);
  inp.focus();
  inp.select();
}

function refreshUi(): void {
  toolButtons.forEach((b) => b.classList.toggle("active", b.dataset.tool === editor.tool));
  $("btn-zoom-reset").textContent = `${editor.zoomPercent()}%`;
  syncDocInputs();
  renderSwatches();
  renderPreflight();

  // Rebuild only when something shown in the list changed (keeps double-click rename working,
  // and never rebuild while a name is being edited).
  const key = JSON.stringify(
    editor.doc.shapes.map((s) => [s.id, s.kind, s.name, s.hidden, s.locked, s.kind === "line" ? s.stroke : s.fill, editor.isSelected(s.id)]),
  );
  if (key !== layerKey && !layerList.querySelector(".name-input")) {
    layerKey = key;
    layerList.innerHTML = "";
    [...editor.doc.shapes].reverse().forEach((s, i) => {
      const li = document.createElement("li");
      const label = s.name || `${s.kind} ${editor.doc.shapes.length - i}`;
      li.className = [editor.isSelected(s.id) ? "selected" : "", s.hidden ? "is-hidden" : "", s.locked ? "is-locked" : ""].join(" ").trim();

      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = s.kind === "line" ? s.stroke : s.fill;
      const nameEl = document.createElement("span");
      nameEl.className = "name";
      nameEl.textContent = label;
      nameEl.title = "Double-click to rename";
      nameEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startRename(nameEl, s.id, s.name ?? "");
      });

      li.append(
        sw,
        nameEl,
        iconButton(s.hidden ? ICON_EYE_OFF : ICON_EYE, s.hidden ? "Show" : "Hide", !!s.hidden, () => editor.toggleHidden(s.id)),
        iconButton(s.locked ? ICON_LOCK : ICON_UNLOCK, s.locked ? "Unlock" : "Lock", !!s.locked, () => editor.toggleLocked(s.id)),
      );
      li.addEventListener("click", (e) => {
        editor.setTool("select");
        editor.select(s.id, e.shiftKey || e.ctrlKey || e.metaKey);
      });
      layerList.appendChild(li);
    });
  }

  // Mirror the selected shape's colours into the property inputs.
  const sel = editor.selected();
  if (sel && sel.id !== lastSelectedForProps) mirrorStyle(sel);
  lastSelectedForProps = sel?.id ?? null;
}

editor.onChange = refreshUi;
refreshUi();

// ---------- actions ----------
$("btn-undo").addEventListener("click", () => editor.undo());
$("btn-redo").addEventListener("click", () => editor.redo());
$("btn-delete").addEventListener("click", () => editor.deleteSelected());
$("btn-duplicate").addEventListener("click", () => editor.duplicate());
$("btn-zoom-in").addEventListener("click", () => editor.zoomIn());
$("btn-zoom-out").addEventListener("click", () => editor.zoomOut());
$("btn-zoom-reset").addEventListener("click", () => editor.zoomReset());
$("btn-forward").addEventListener("click", () => editor.reorder(1));
$("btn-backward").addEventListener("click", () => editor.reorder(-1));

async function doExport(): Promise<void> {
  if (await saveText("drawing.svg", editor.toSvgString(), "svg", "SVG image")) status.textContent = "Exported SVG";
}
async function doExportPdf(): Promise<void> {
  const bytes = pdfBytes(docToPdf(editor.doc));
  if (await saveBytes("print.pdf", bytes, "pdf", "PDF")) {
    const problems = preflight(editor.doc).filter((i) => i.level === "error" || i.level === "warn").length;
    status.textContent = problems ? `Exported print PDF (CMYK) with ${problems} preflight warning${problems === 1 ? "" : "s"}` : "Exported print PDF (CMYK)";
  }
}
async function doSave(): Promise<void> {
  if (await saveText("project.spp", editor.toProjectJson(), "spp", "Smart Pre-Press project")) status.textContent = "Project saved";
}
async function doOpen(): Promise<void> {
  const text = await openText("spp", "Smart Pre-Press project");
  if (text === null) return;
  try {
    editor.loadDoc(Editor.parseProject(text));
    status.textContent = "Project opened";
  } catch (err) {
    status.textContent = `Could not open file: ${(err as Error).message}`;
  }
}

$("btn-export").addEventListener("click", doExport);
$("btn-pdf").addEventListener("click", doExportPdf);
$("btn-save").addEventListener("click", doSave);
$("btn-open").addEventListener("click", doOpen);

window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === "s") {
    e.preventDefault();
    void doSave();
  } else if (k === "o") {
    e.preventDefault();
    void doOpen();
  } else if (k === "e") {
    e.preventDefault();
    void doExport();
  } else if (k === "p") {
    e.preventDefault();
    void doExportPdf();
  }
});
