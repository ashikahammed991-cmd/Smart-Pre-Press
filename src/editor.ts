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

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Drag =
  | { type: "move"; last: Pt; moved: boolean }
  | { type: "draw"; start: Pt; shape: Shape }
  | { type: "handle"; node: Node }
  | { type: "resize"; handle: HandleId; orig: Shape; ob: Box; moved: boolean }
  | { type: "pan"; last: Pt }
  | null;

const CLOSE_DIST = 10;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;

const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

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
  private clip: Shape | null = null;
  private spaceDown = false;

  private readonly baseView: Box = { x: -100, y: -100, w: 1200, h: 900 };
  private view: Box = { ...this.baseView };

  constructor(private svg: SVGSVGElement) {
    svg.addEventListener("pointerdown", (e) => this.onDown(e));
    svg.addEventListener("pointermove", (e) => this.onMove(e));
    svg.addEventListener("pointerup", (e) => this.onUp(e));
    svg.addEventListener("dblclick", () => this.finishPen(false));
    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, this.pt(e));
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
    this.render();
  }

  // ---------- view (zoom / pan) ----------

  zoomPercent(): number {
    return Math.round((this.baseView.w / this.view.w) * 100);
  }

  zoomAt(factor: number, center: Pt): void {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (this.baseView.w / this.view.w) * factor));
    const newW = this.baseView.w / zoom;
    const k = newW / this.view.w;
    this.view = {
      x: center.x - (center.x - this.view.x) * k,
      y: center.y - (center.y - this.view.y) * k,
      w: newW,
      h: this.view.h * k,
    };
    this.render();
  }

  zoomIn(): void {
    this.zoomAt(1.25, { x: this.view.x + this.view.w / 2, y: this.view.y + this.view.h / 2 });
  }

  zoomOut(): void {
    this.zoomAt(0.8, { x: this.view.x + this.view.w / 2, y: this.view.y + this.view.h / 2 });
  }

  zoomReset(): void {
    this.view = { ...this.baseView };
    this.render();
  }

  /** Size of one screen pixel in drawing units (keeps handles a constant size on screen). */
  private px(): number {
    const m = this.svg.getScreenCTM();
    return m && m.a > 0 ? 1 / m.a : 1;
  }

  private updateCursor(): void {
    this.svg.style.cursor = this.spaceDown ? "grab" : this.tool === "select" ? "default" : "crosshair";
  }

  // ---------- public API ----------

  setTool(t: ToolName): void {
    if (this.tool === "pen" && t !== "pen") this.finishPen(false);
    this.tool = t;
    if (t !== "select") this.selectedId = null;
    this.updateCursor();
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

  copy(): void {
    const s = this.selected();
    if (!s) return;
    this.clip = JSON.parse(JSON.stringify(s));
    this.onStatus("Copied");
  }

  paste(): void {
    if (!this.clip) return;
    const s = JSON.parse(JSON.stringify(this.clip)) as Shape;
    s.id = newId();
    translate(s, 20, 20);
    this.clip = JSON.parse(JSON.stringify(s)); // repeated pastes cascade
    this.pushUndo();
    this.doc.shapes.push(s);
    this.selectedId = s.id;
    this.render();
  }

  duplicate(): void {
    this.copy();
    this.paste();
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

  private pt(e: PointerEvent | WheelEvent): Pt {
    const p = this.svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const m = this.svg.getScreenCTM();
    const r = m ? p.matrixTransform(m.inverse()) : p;
    return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10 };
  }

  private onDown(e: PointerEvent): void {
    // Pan: middle mouse button, or hold Space and drag.
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      e.preventDefault();
      this.svg.setPointerCapture(e.pointerId);
      this.drag = { type: "pan", last: { x: e.clientX, y: e.clientY } };
      this.svg.style.cursor = "grabbing";
      return;
    }
    if (e.button !== 0) return;

    const p = this.pt(e);
    this.svg.setPointerCapture(e.pointerId);

    switch (this.tool) {
      case "select": {
        const target = e.target as Element;
        const handleEl = target.closest("[data-handle]");
        const sel = this.selected();
        if (handleEl && sel) {
          this.pushUndo();
          this.drag = {
            type: "resize",
            handle: handleEl.getAttribute("data-handle") as HandleId,
            orig: JSON.parse(JSON.stringify(sel)),
            ob: bounds(sel),
            moved: false,
          };
          break;
        }
        const el = target.closest("[data-id]");
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
        if (first && this.penNodes.length >= 3 && Math.hypot(p.x - first.p.x, p.y - first.p.y) < CLOSE_DIST * this.px()) {
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
    const d = this.drag;

    if (d?.type === "pan") {
      const m = this.svg.getScreenCTM();
      const s = m && m.a > 0 ? m.a : 1;
      this.view.x -= (e.clientX - d.last.x) / s;
      this.view.y -= (e.clientY - d.last.y) / s;
      d.last = { x: e.clientX, y: e.clientY };
      this.render();
      return;
    }

    const p = this.pt(e);
    this.hover = p;

    if (d?.type === "move") {
      const s = this.selected();
      if (s) {
        translate(s, p.x - d.last.x, p.y - d.last.y);
        d.last = p;
        d.moved = true;
      }
    } else if (d?.type === "resize") {
      this.doResize(d, p, e.shiftKey);
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
    if (d?.type === "pan") {
      this.updateCursor();
    } else if (d?.type === "draw") {
      const b = bounds(d.shape);
      // Discard accidental clicks that produced an empty shape.
      if (b.w < 2 && b.h < 2) {
        this.doc.shapes = this.doc.shapes.filter((s) => s.id !== d.shape.id);
        this.undoStack.pop();
      } else {
        this.selectedId = d.shape.id;
      }
    } else if ((d?.type === "move" || d?.type === "resize") && !d.moved) {
      this.undoStack.pop(); // a plain click is not an edit
    }
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT") return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod) {
      switch (key) {
        case "z":
          e.preventDefault();
          e.shiftKey ? this.redo() : this.undo();
          return;
        case "y":
          e.preventDefault();
          this.redo();
          return;
        case "c":
          e.preventDefault();
          this.copy();
          return;
        case "v":
          e.preventDefault();
          this.paste();
          return;
        case "d":
          e.preventDefault();
          this.duplicate();
          return;
        case "0":
          e.preventDefault();
          this.zoomReset();
          return;
        case "=":
        case "+":
          e.preventDefault();
          this.zoomIn();
          return;
        case "-":
          e.preventDefault();
          this.zoomOut();
          return;
      }
      return; // other shortcuts (save/open/export) are handled in main.ts
    }

    if (e.key === " ") {
      e.preventDefault(); // also stops Space from "clicking" a focused button
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.updateCursor();
      }
      return;
    }

    const tools: Record<string, ToolName> = { v: "select", r: "rect", e: "ellipse", l: "line", p: "pen" };
    const t = tools[key];
    if (t) {
      this.setTool(t);
      this.onChange();
      return;
    }

    if (e.key.startsWith("Arrow") && this.selected()) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      this.pushUndo();
      translate(this.selected()!, dx, dy);
      this.render();
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

  private onKeyUp(e: KeyboardEvent): void {
    if (e.key !== " ") return;
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
    this.spaceDown = false;
    if (this.drag?.type !== "pan") this.updateCursor();
  }

  // ---------- resize ----------

  private doResize(d: Extract<Drag, { type: "resize" }>, p: Pt, keepRatio: boolean): void {
    const { handle, orig, ob } = d;
    const movesW = handle.includes("w");
    const movesE = handle.includes("e");
    const movesN = handle.includes("n");
    const movesS = handle.includes("s");

    // The edge being dragged, and the opposite edge that stays put (the anchor).
    const hx = movesW ? ob.x : movesE ? ob.x + ob.w : null;
    const hy = movesN ? ob.y : movesS ? ob.y + ob.h : null;
    const ax = movesW ? ob.x + ob.w : ob.x;
    const ay = movesN ? ob.y + ob.h : ob.y;

    let sx = 1;
    let sy = 1;
    if (hx !== null && Math.abs(hx - ax) > 0.001) sx = (p.x - ax) / (hx - ax);
    if (hy !== null && Math.abs(hy - ay) > 0.001) sy = (p.y - ay) / (hy - ay);

    if (keepRatio && hx !== null && hy !== null) {
      const s = Math.max(Math.abs(sx), Math.abs(sy));
      sx = (sx < 0 ? -1 : 1) * s;
      sy = (sy < 0 ? -1 : 1) * s;
    }
    if (Math.abs(sx) < 0.01) sx = sx < 0 ? -0.01 : 0.01;
    if (Math.abs(sy) < 0.01) sy = sy < 0 ? -0.01 : 0.01;

    const i = this.doc.shapes.findIndex((s) => s.id === orig.id);
    if (i < 0) return;
    this.doc.shapes[i] = this.scaled(orig, ax, ay, sx, sy);
    d.moved = true;
  }

  /** Scale a copy of `o` around the anchor (ax, ay). Negative factors mirror the shape. */
  private scaled(o: Shape, ax: number, ay: number, sx: number, sy: number): Shape {
    const f = (x: number, y: number): Pt => ({ x: ax + (x - ax) * sx, y: ay + (y - ay) * sy });
    switch (o.kind) {
      case "rect": {
        const a = f(o.x, o.y);
        const b = f(o.x + o.w, o.y + o.h);
        return { ...o, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
      }
      case "ellipse": {
        const c = f(o.cx, o.cy);
        return { ...o, cx: c.x, cy: c.y, rx: o.rx * Math.abs(sx), ry: o.ry * Math.abs(sy) };
      }
      case "line": {
        const a = f(o.x1, o.y1);
        const b = f(o.x2, o.y2);
        return { ...o, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      }
      case "path":
        return {
          ...o,
          nodes: o.nodes.map((n) => ({
            p: f(n.p.x, n.p.y),
            inH: { x: n.inH.x * sx, y: n.inH.y * sy },
            outH: { x: n.outH.x * sx, y: n.outH.y * sy },
          })),
        };
    }
  }

  private finishPen(closed: boolean): void {
    if (this.tool !== "pen") return;
    // A double-click adds a duplicate final anchor; drop it.
    if (!closed && this.penNodes.length >= 2) {
      const a = this.penNodes[this.penNodes.length - 1].p;
      const b = this.penNodes[this.penNodes.length - 2].p;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 2 * this.px()) this.penNodes.pop();
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
    this.svg.setAttribute("viewBox", `${this.view.x} ${this.view.y} ${this.view.w} ${this.view.h}`);
    const px = this.px();

    const parts: string[] = [];
    parts.push(
      `<rect x="0" y="0" width="${ARTBOARD.width}" height="${ARTBOARD.height}" fill="#ffffff" stroke="#3a3f4b" stroke-width="1" vector-effect="non-scaling-stroke"/>`,
    );
    for (const s of this.doc.shapes) parts.push(shapeToSvg(s, true));

    const sel = this.selected();
    if (sel) {
      const b = bounds(sel);
      parts.push(
        `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#2f7cf6" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" pointer-events="none"/>`,
      );
      const half = 4 * px;
      const pos: Record<HandleId, [number, number]> = {
        nw: [b.x, b.y],
        n: [b.x + b.w / 2, b.y],
        ne: [b.x + b.w, b.y],
        e: [b.x + b.w, b.y + b.h / 2],
        se: [b.x + b.w, b.y + b.h],
        s: [b.x + b.w / 2, b.y + b.h],
        sw: [b.x, b.y + b.h],
        w: [b.x, b.y + b.h / 2],
      };
      for (const id of Object.keys(pos) as HandleId[]) {
        const [hx, hy] = pos[id];
        parts.push(
          `<rect data-handle="${id}" x="${hx - half}" y="${hy - half}" width="${half * 2}" height="${half * 2}" fill="#ffffff" stroke="#2f7cf6" stroke-width="1" vector-effect="non-scaling-stroke" style="cursor:${HANDLE_CURSORS[id]}"/>`,
        );
      }
    }

    if (this.tool === "pen" && this.penNodes.length > 0) {
      const preview = [...this.penNodes];
      if (this.hover && !this.drag) preview.push({ p: this.hover, inH: { x: 0, y: 0 }, outH: { x: 0, y: 0 } });
      parts.push(
        `<path d="${pathData(preview, false)}" fill="none" stroke="#2f7cf6" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none"/>`,
      );
      const half = 3 * px;
      for (const n of this.penNodes) {
        parts.push(
          `<rect x="${n.p.x - half}" y="${n.p.y - half}" width="${half * 2}" height="${half * 2}" fill="#fff" stroke="#2f7cf6" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`,
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
