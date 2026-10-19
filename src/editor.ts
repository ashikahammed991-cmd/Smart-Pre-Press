import {
  ARTBOARD,
  Doc,
  Node,
  PathShape,
  Pt,
  Shape,
  Style,
  bounds,
  docToSvg,
  newDoc,
  newId,
  pathData,
  shapeToSvg,
  translate,
} from "./model";

export type ToolName = "select" | "rect" | "ellipse" | "line" | "pen";

type Drag =
  | { type: "move"; last: Pt; moved: boolean }
  | { type: "draw"; start: Pt; shape: Shape }
  | { type: "handle"; node: Node }
  | null;

const CLOSE_DIST = 10;

export class Editor {
  doc: Doc = newDoc();
  tool: ToolName = "select";
  style: Style = { fill: "#4f8cff", stroke: "#1b2a4a", strokeWidth: 2 };
  selectedId: string | null = null;

  /** Called whenever the UI should refresh (layers list, status, etc.). */
  onChange: () => void = () => {};
  onStatus: (msg: string) => void = () => {};

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private drag: Drag = null;
  private penNodes: Node[] = [];
  private hover: Pt | null = null;

  constructor(private svg: SVGSVGElement) {
    svg.addEventListener("pointerdown", (e) => this.onDown(e));
    svg.addEventListener("pointermove", (e) => this.onMove(e));
    svg.addEventListener("pointerup", (e) => this.onUp(e));
    svg.addEventListener("dblclick", () => this.finishPen(false));
    window.addEventListener("keydown", (e) => this.onKey(e));
    this.render();
  }

  // ---------- public API ----------

  setTool(t: ToolName): void {
    if (this.tool === "pen" && t !== "pen") this.finishPen(false);
    this.tool = t;
    if (t !== "select") this.selectedId = null;
    this.svg.style.cursor = t === "select" ? "default" : "crosshair";
    this.onStatus(`Tool: ${t}`);
    this.render();
  }

  setStyle(patch: Partial<Style>): void {
    Object.assign(this.style, patch);
    const s = this.selected();
    if (s) {
      this.pushUndo();
      Object.assign(s, patch);
      this.render();
    }
  }

  selected(): Shape | undefined {
    return this.doc.shapes.find((s) => s.id === this.selectedId);
  }

  select(id: string | null): void {
    this.selectedId = id;
    const s = this.selected();
    if (s) this.onStatus(`Selected ${s.kind}`);
    this.render();
  }

  deleteSelected(): void {
    if (!this.selectedId) return;
    this.pushUndo();
    this.doc.shapes = this.doc.shapes.filter((s) => s.id !== this.selectedId);
    this.selectedId = null;
    this.render();
  }

  reorder(direction: 1 | -1): void {
    const i = this.doc.shapes.findIndex((s) => s.id === this.selectedId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= this.doc.shapes.length) return;
    this.pushUndo();
    const arr = this.doc.shapes;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.render();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (prev === undefined) return;
    this.redoStack.push(JSON.stringify(this.doc));
    this.doc = JSON.parse(prev);
    this.afterHistory();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(JSON.stringify(this.doc));
    this.doc = JSON.parse(next);
    this.afterHistory();
  }

  loadDoc(doc: Doc): void {
    this.pushUndo();
    this.doc = doc;
    this.selectedId = null;
    this.render();
  }

  toSvgString(): string {
    return docToSvg(this.doc);
  }

  toProjectJson(): string {
    return JSON.stringify({ app: "smart-pre-press", version: 1, doc: this.doc }, null, 2);
  }

  static parseProject(text: string): Doc {
    const data = JSON.parse(text);
    if (data?.app !== "smart-pre-press" || !data.doc || !Array.isArray(data.doc.shapes)) {
      throw new Error("This is not a Smart Pre-Press project file");
    }
    return data.doc as Doc;
  }

  // ---------- history ----------

  private pushUndo(): void {
    this.undoStack.push(JSON.stringify(this.doc));
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  private afterHistory(): void {
    if (!this.selected()) this.selectedId = null;
    this.render();
  }

  // ---------- input ----------

  private pt(e: PointerEvent): Pt {
    const p = this.svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const m = this.svg.getScreenCTM();
    const r = m ? p.matrixTransform(m.inverse()) : p;
    return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10 };
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const p = this.pt(e);
    this.svg.setPointerCapture(e.pointerId);

    switch (this.tool) {
      case "select": {
        const el = (e.target as Element).closest("[data-id]");
        const id = el?.getAttribute("data-id") ?? null;
        this.selectedId = id;
        if (id) {
          this.pushUndo();
          this.drag = { type: "move", last: p, moved: false };
        }
        this.render();
        break;
      }
      case "rect":
      case "ellipse":
      case "line": {
        const base = { id: newId(), ...this.style };
        let shape: Shape;
        if (this.tool === "rect") shape = { ...base, kind: "rect", x: p.x, y: p.y, w: 0, h: 0 };
        else if (this.tool === "ellipse") shape = { ...base, kind: "ellipse", cx: p.x, cy: p.y, rx: 0, ry: 0 };
        else shape = { ...base, kind: "line", x1: p.x, y1: p.y, x2: p.x, y2: p.y };
        this.pushUndo();
        this.doc.shapes.push(shape);
        this.drag = { type: "draw", start: p, shape };
        this.render();
        break;
      }
      case "pen": {
        const first = this.penNodes[0];
        if (first && this.penNodes.length >= 3 && Math.hypot(p.x - first.p.x, p.y - first.p.y) < CLOSE_DIST) {
          this.finishPen(true);
          break;
        }
        const node: Node = { p, inH: { x: 0, y: 0 }, outH: { x: 0, y: 0 } };
        this.penNodes.push(node);
        this.drag = { type: "handle", node };
        this.render();
        break;
      }
    }
  }

  private onMove(e: PointerEvent): void {
    const p = this.pt(e);
    this.hover = p;
    const d = this.drag;

    if (d?.type === "move") {
      const s = this.selected();
      if (s) {
        translate(s, p.x - d.last.x, p.y - d.last.y);
        d.last = p;
        d.moved = true;
      }
    } else if (d?.type === "draw") {
      const s = d.shape;
      const { start } = d;
      if (s.kind === "rect") {
        s.x = Math.min(start.x, p.x);
        s.y = Math.min(start.y, p.y);
        s.w = Math.abs(p.x - start.x);
        s.h = Math.abs(p.y - start.y);
      } else if (s.kind === "ellipse") {
        s.cx = (start.x + p.x) / 2;
        s.cy = (start.y + p.y) / 2;
        s.rx = Math.abs(p.x - start.x) / 2;
        s.ry = Math.abs(p.y - start.y) / 2;
      } else if (s.kind === "line") {
        s.x2 = p.x;
        s.y2 = p.y;
      }
    } else if (d?.type === "handle") {
      const n = d.node;
      n.outH = { x: p.x - n.p.x, y: p.y - n.p.y };
      n.inH = { x: -n.outH.x, y: -n.outH.y };
    } else if (this.tool !== "pen") {
      return; // nothing to redraw
    }
    this.render();
  }

  private onUp(e: PointerEvent): void {
    if (this.svg.hasPointerCapture(e.pointerId)) this.svg.releasePointerCapture(e.pointerId);
    const d = this.drag;
    this.drag = null;
    if (d?.type === "draw") {
      const b = bounds(d.shape);
      // Discard accidental clicks that produced an empty shape.
      if (b.w < 2 && b.h < 2) {
        this.doc.shapes = this.doc.shapes.filter((s) => s.id !== d.shape.id);
        this.undoStack.pop();
      } else {
        this.selectedId = d.shape.id;
      }
    } else if (d?.type === "move" && !d.moved) {
      this.undoStack.pop(); // a plain click is not an edit
    }
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT") return;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? this.redo() : this.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod) return; // other shortcuts (save/open/export) are handled in main.ts

    const tools: Record<string, ToolName> = { v: "select", r: "rect", e: "ellipse", l: "line", p: "pen" };
    const t = tools[e.key.toLowerCase()];
    if (t) {
      this.setTool(t);
      this.onChange();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") this.deleteSelected();
    else if (e.key === "Enter") this.finishPen(false);
    else if (e.key === "Escape") {
      this.penNodes = [];
      this.selectedId = null;
      this.render();
    }
  }

  private finishPen(closed: boolean): void {
    if (this.tool !== "pen") return;
    // A double-click adds a duplicate final anchor; drop it.
    if (!closed && this.penNodes.length >= 2) {
      const a = this.penNodes[this.penNodes.length - 1].p;
      const b = this.penNodes[this.penNodes.length - 2].p;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 2) this.penNodes.pop();
    }
    if (this.penNodes.length >= 2) {
      const shape: PathShape = { id: newId(), kind: "path", nodes: this.penNodes, closed, ...this.style };
      this.pushUndo();
      this.doc.shapes.push(shape);
      this.selectedId = shape.id;
    }
    this.penNodes = [];
    this.drag = null;
    this.render();
  }

  // ---------- rendering ----------

  render(): void {
    const parts: string[] = [];
    parts.push(
      `<rect x="0" y="0" width="${ARTBOARD.width}" height="${ARTBOARD.height}" fill="#ffffff" stroke="#3a3f4b" stroke-width="1" vector-effect="non-scaling-stroke"/>`,
    );
    for (const s of this.doc.shapes) parts.push(shapeToSvg(s, true));

    const sel = this.selected();
    if (sel) {
      const b = bounds(sel);
      parts.push(
        `<rect x="${b.x - 3}" y="${b.y - 3}" width="${b.w + 6}" height="${b.h + 6}" fill="none" stroke="#2f7cf6" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" pointer-events="none"/>`,
      );
    }

    if (this.tool === "pen" && this.penNodes.length > 0) {
      const preview = [...this.penNodes];
      if (this.hover && !this.drag) preview.push({ p: this.hover, inH: { x: 0, y: 0 }, outH: { x: 0, y: 0 } });
      parts.push(
        `<path d="${pathData(preview, false)}" fill="none" stroke="#2f7cf6" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none"/>`,
      );
      for (const n of this.penNodes) {
        parts.push(
          `<rect x="${n.p.x - 3}" y="${n.p.y - 3}" width="6" height="6" fill="#fff" stroke="#2f7cf6" pointer-events="none"/>`,
        );
        if (n.outH.x || n.outH.y) {
          parts.push(
            `<line x1="${n.p.x - n.outH.x}" y1="${n.p.y - n.outH.y}" x2="${n.p.x + n.outH.x}" y2="${n.p.y + n.outH.y}" stroke="#2f7cf6" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`,
          );
        }
      }
    }

    this.svg.innerHTML = parts.join("");
    this.onChange();
  }
}
