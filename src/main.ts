import "./style.css";
import { Editor, ToolName } from "./editor";
import { openText, saveBytes, saveText } from "./io";
import { Cmyk, clampCmyk, cmykToHex, hexToCmyk } from "./color";
import { mmToPx, pxToMm } from "./model";
import { docToPdf, pdfBytes } from "./pdf";

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

// ---------- layers panel ----------
const layerList = $("layer-list");
let lastSelectedForProps: string | null = null;

function refreshUi(): void {
  toolButtons.forEach((b) => b.classList.toggle("active", b.dataset.tool === editor.tool));
  $("btn-zoom-reset").textContent = `${editor.zoomPercent()}%`;
  syncDocInputs();

  layerList.innerHTML = "";
  [...editor.doc.shapes].reverse().forEach((s, i) => {
    const li = document.createElement("li");
    li.textContent = `${s.kind} ${editor.doc.shapes.length - i}`;
    li.className = editor.isSelected(s.id) ? "selected" : "";
    li.addEventListener("click", (e) => {
      editor.setTool("select");
      editor.select(s.id, e.shiftKey || e.ctrlKey || e.metaKey);
    });
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = s.kind === "line" ? s.stroke : s.fill;
    li.prepend(sw);
    layerList.appendChild(li);
  });

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
  if (await saveBytes("print.pdf", bytes, "pdf", "PDF")) status.textContent = "Exported print PDF (CMYK)";
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
