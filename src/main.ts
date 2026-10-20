import "./style.css";
import { Editor, ToolName } from "./editor";
import { openText, saveText } from "./io";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

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

// ---------- properties ----------
const fill = $<HTMLInputElement>("fill");
const stroke = $<HTMLInputElement>("stroke");
const strokeWidth = $<HTMLInputElement>("stroke-width");
fill.addEventListener("input", () => editor.setStyle({ fill: fill.value }));
stroke.addEventListener("input", () => editor.setStyle({ stroke: stroke.value }));
strokeWidth.addEventListener("input", () => editor.setStyle({ strokeWidth: Number(strokeWidth.value) || 0 }));

// ---------- layers panel ----------
const layerList = $("layer-list");
let lastSelectedForProps: string | null = null;

function refreshUi(): void {
  toolButtons.forEach((b) => b.classList.toggle("active", b.dataset.tool === editor.tool));
  $("btn-zoom-reset").textContent = `${editor.zoomPercent()}%`;

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
  if (sel && sel.id !== lastSelectedForProps) {
    fill.value = toHex(sel.fill);
    stroke.value = toHex(sel.stroke);
    strokeWidth.value = String(sel.strokeWidth);
  }
  lastSelectedForProps = sel?.id ?? null;
}

function toHex(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#000000";
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
  }
});
