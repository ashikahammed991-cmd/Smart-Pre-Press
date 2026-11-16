// Data Merge for the Vector Editor, like InDesign's Data Merge panel:
//   1. Select Data Source (an Excel .xlsx or a CSV file): every column becomes a field.
//   2. Select a text object in the editor and click a field: the text is bound to the field.
//   3. Preview the records one by one.
//   4. Create the merged PDF: one record per artboard page, or several records per page in a grid.
// It drives the editor through window.vectorcraft (variable.* / dataset.* / document.export).

import { PDFDocument } from "pdf-lib";
import { saveBytes } from "./io";
import { readDataFile, toCsv, type Rows } from "./mergedata";

interface EditorApi {
  execute?: (command: string, params?: Record<string, unknown>) => Promise<any>;
}

const MM = 72 / 25.4;

function api(): EditorApi | null {
  try {
    const f = document.getElementById("vc-frame") as HTMLIFrameElement | null;
    const w = f?.contentWindow as (Window & { vectorcraft?: EditorApi }) | null | undefined;
    return w?.vectorcraft ?? null;
  } catch {
    return null;
  }
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e));

export function initDataMerge(): void {
  const panel = document.createElement("div");
  panel.id = "dm-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="dm-head"><b>Data Merge</b><button id="dm-close" title="Close">×</button></div>
    <div class="dm-body">
      <button id="dm-pick" class="primary">Select Data Source…</button>
      <input id="dm-file" type="file" accept=".xlsx,.csv,.txt,.tsv" hidden />
      <div id="dm-info" class="dm-dim">No data source yet. Use a CSV or an Excel “Unicode Text” (.txt) file (or .xlsx); the first row holds the field names.</div>
      <div id="dm-fields-title" class="dm-title" hidden>Fields <span class="dm-dim">– select a text object in the editor, then click a field</span></div>
      <div id="dm-fields"></div>
      <div id="dm-prev" hidden>
        <div class="dm-title">Preview</div>
        <div class="dm-row"><button id="dm-back">◀</button><span id="dm-rec">1 / 1</span><button id="dm-next">▶</button></div>
      </div>
      <div id="dm-out" hidden>
        <div class="dm-title">Create Merged PDF</div>
        <div class="dm-row">Records <input id="dm-from" type="number" min="1" value="1" /> to <input id="dm-to" type="number" min="1" value="1" /></div>
        <div class="dm-row">Template artboard <input id="dm-ab" type="number" min="1" value="1" /></div>
        <label class="dm-row"><input type="radio" name="dm-mode" value="single" checked /> One record per page</label>
        <label class="dm-row"><input type="radio" name="dm-mode" value="grid" /> Several records per page</label>
        <div id="dm-grid" hidden>
          <div class="dm-row">Page <input id="dm-pw" type="number" value="210" /> × <input id="dm-ph" type="number" value="297" /> mm</div>
          <div class="dm-row">Margin <input id="dm-mg" type="number" value="10" /> Gap <input id="dm-gp" type="number" value="3" /> mm</div>
          <div class="dm-row">Columns <input id="dm-cols" type="number" min="0" value="0" /> Rows <input id="dm-rows" type="number" min="0" value="0" /> <span class="dm-dim">(0 = fill the page)</span></div>
        </div>
        <button id="dm-make" class="primary">Create Merged PDF…</button>
      </div>
      <div id="dm-msg"></div>
    </div>`;
  document.body.appendChild(panel);

  // Drag the panel by its title bar, like any other window; the position is remembered.
  const head = panel.querySelector<HTMLElement>(".dm-head")!;
  const place = (x: number, y: number): void => {
    const nx = Math.min(Math.max(0, x), window.innerWidth - 80);
    const ny = Math.min(Math.max(0, y), window.innerHeight - 40);
    panel.style.left = nx + "px";
    panel.style.top = ny + "px";
    panel.style.right = "auto";
  };
  try {
    const sv = JSON.parse(localStorage.getItem("spp-dm-pos") || "null") as { x: number; y: number } | null;
    if (sv) place(sv.x, sv.y);
  } catch { /* ignore */ }
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const r = panel.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent): void => place(m.clientX - dx, m.clientY - dy);
    const up = (): void => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", up);
      try {
        const q = panel.getBoundingClientRect();
        localStorage.setItem("spp-dm-pos", JSON.stringify({ x: q.left, y: q.top }));
      } catch { /* ignore */ }
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", up);
    e.preventDefault();
  });

  const $ = <T extends HTMLElement>(id: string): T => panel.querySelector("#" + id) as T;
  const msg = $("dm-msg");
  const say = (t: string, bad = false): void => {
    msg.textContent = t;
    msg.className = bad ? "bad" : "";
  };

  let names: string[] = [];
  let headers: string[] = [];
  let count = 0;
  let cur = 0;

  const editor = (): EditorApi | null => {
    const a = api();
    if (!a?.execute) {
      say("The Vector Editor is not ready. Open the Vector Editor tab and wait until it has loaded.", true);
      return null;
    }
    return a;
  };

  const showRecord = async (i: number): Promise<void> => {
    const a = editor();
    if (!a?.execute || !names.length) return;
    cur = Math.min(Math.max(0, i), names.length - 1);
    $("dm-rec").textContent = `${cur + 1} / ${names.length}`;
    try {
      const r = await a.execute("dataset.select", { name: names[cur] });
      if (r && typeof r === "object" && r.warning) say(String(r.warning));
      else say("");
    } catch (e) {
      say(errText(e), true);
    }
  };

  // Window > Data Merge inside the Vector Editor posts {spp:"spp:data-merge"} to this page.
  window.addEventListener("message", (ev) => {
    const d = ev.data as { spp?: string } | null;
    if (d && d.spp === "spp:data-merge") panel.hidden = !panel.hidden;
  });
  $("dm-close").addEventListener("click", () => (panel.hidden = true));
  $("dm-pick").addEventListener("click", () => $<HTMLInputElement>("dm-file").click());

  $<HTMLInputElement>("dm-file").addEventListener("change", (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    (ev.target as HTMLInputElement).value = "";
    if (!f) return;
    void (async () => {
      const a = editor();
      if (!a?.execute) return;
      try {
        say("Reading the data file…");
        const all: Rows = await readDataFile(f);
        if (all.length < 2) throw new Error("The file needs a header row and at least one record.");
        // drop columns without a field name
        const keep = all[0].map((h, i) => (h.trim() ? i : -1)).filter((i) => i >= 0);
        const rows = all.map((r) => keep.map((i) => r[i] ?? ""));
        rows[0] = rows[0].map((h) => h.trim());
        const res = await a.execute("dataset.import", { csv: toCsv(rows) });
        headers = rows[0];
        names = Array.isArray(res?.names) ? (res.names as string[]) : rows.slice(1).map((_, i) => `Data Set ${i + 1}`);
        count = names.length;
        $("dm-info").textContent = `${f.name}: ${count} records, ${headers.length} fields.`;
        const fields = $("dm-fields");
        fields.textContent = "";
        for (const h of headers) {
          const b = document.createElement("button");
          b.className = "dm-field";
          b.textContent = h.replace(/^[#@]/, "");
          b.title = h.startsWith("@") ? "Image field" : h.startsWith("#") ? "Show/hide field" : "Text field: binds the selected text object";
          b.addEventListener("click", () => {
            void (async () => {
              const ed = editor();
              if (!ed?.execute) return;
              try {
                const r = await ed.execute("variable.bind", { variable: h.replace(/^[#@]/, "") });
                say(r && (r.bound?.length ?? r.bound) ? `Bound to “${b.textContent}”.` : r && r.already?.length ? `Already bound to “${b.textContent}”.` : `Select an object in the editor first, then click “${b.textContent}”.`);
              } catch (e) {
                say(errText(e), true);
              }
            })();
          });
          fields.appendChild(b);
        }
        $("dm-fields-title").hidden = false;
        $("dm-prev").hidden = false;
        $("dm-out").hidden = false;
        $<HTMLInputElement>("dm-from").value = "1";
        $<HTMLInputElement>("dm-to").value = String(count);
        $<HTMLInputElement>("dm-to").max = String(count);
        $("dm-rec").textContent = `1 / ${count}`;
        say("Data source loaded. In the editor, select a text object and click a field to bind it.");
        await showRecord(0);
      } catch (e) {
        say(errText(e), true);
      }
    })();
  });

  $("dm-back").addEventListener("click", () => void showRecord(cur - 1));
  $("dm-next").addEventListener("click", () => void showRecord(cur + 1));
  panel.querySelectorAll('input[name="dm-mode"]').forEach((r) =>
    r.addEventListener("change", () => ($("dm-grid").hidden = !(panel.querySelector('input[name="dm-mode"]:checked') as HTMLInputElement).value.startsWith("grid"))),
  );

  const num = (id: string, def: number): number => {
    const v = Number($<HTMLInputElement>(id).value);
    return Number.isFinite(v) ? v : def;
  };

  $("dm-make").addEventListener("click", () => {
    void (async () => {
      const a = editor();
      if (!a?.execute || !names.length) return;
      const from = Math.max(1, Math.floor(num("dm-from", 1)));
      const to = Math.min(count, Math.floor(num("dm-to", count)));
      if (to < from) {
        say("“To” must not be smaller than “From”.", true);
        return;
      }
      const ab = Math.max(1, Math.floor(num("dm-ab", 1))) - 1;
      const grid = (panel.querySelector('input[name="dm-mode"]:checked') as HTMLInputElement).value === "grid";
      const make = $<HTMLButtonElement>("dm-make");
      make.disabled = true;
      try {
        const out = await PDFDocument.create();
        // grid settings (filled in from the first record's size)
        let pg: ReturnType<PDFDocument["addPage"]> | null = null;
        let slot = 0;
        let perPage = 1;
        let cols = 1;
        let tw = 0;
        let th = 0;
        const PW = num("dm-pw", 210) * MM;
        const PH = num("dm-ph", 297) * MM;
        const MG = num("dm-mg", 10) * MM;
        const GP = num("dm-gp", 3) * MM;
        for (let i = from; i <= to; i++) {
          say(`Creating record ${i - from + 1} of ${to - from + 1}…`);
          await a.execute("dataset.select", { name: names[i - 1] });
          const r = await a.execute("document.export", { format: "pdf", artboard: ab });
          if (!r?.dataBase64) throw new Error("The editor did not return a PDF for record " + i + ".");
          const src = await PDFDocument.load(b64ToBytes(r.dataBase64 as string));
          if (!grid) {
            const [p] = await out.copyPages(src, [0]);
            out.addPage(p);
          } else {
            const [emb] = await out.embedPdf(src, [0]);
            if (i === from) {
              tw = emb.width;
              th = emb.height;
              cols = Math.floor(num("dm-cols", 0)) || Math.max(1, Math.floor((PW - 2 * MG + GP) / (tw + GP)));
              const rows = Math.floor(num("dm-rows", 0)) || Math.max(1, Math.floor((PH - 2 * MG + GP) / (th + GP)));
              perPage = cols * rows;
              if (tw > PW - 2 * MG || th > PH - 2 * MG) throw new Error("One record is bigger than the page. Make the page larger or the margin smaller.");
            }
            if (slot % perPage === 0) pg = out.addPage([PW, PH]);
            const k = slot % perPage;
            const c = k % cols;
            const rr = Math.floor(k / cols);
            pg!.drawPage(emb, { x: MG + c * (tw + GP), y: PH - MG - th - rr * (th + GP) });
            slot++;
          }
          if (i % 5 === 0) await new Promise((res) => setTimeout(res, 0));
        }
        const bytes = await out.save();
        const ok = await saveBytes("merged.pdf", bytes, "pdf", "PDF");
        say(ok ? `Merged PDF saved: ${out.getPageCount()} page(s) from ${to - from + 1} record(s).` : "Cancelled.");
      } catch (e) {
        say(errText(e), true);
      } finally {
        make.disabled = false;
        void showRecord(cur);
      }
    })();
  });
}
