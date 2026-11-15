// Reading the data file of a data merge: CSV / TXT (comma, semicolon or tab) and Excel .xlsx.
// No libraries: an .xlsx is a zip of XML files, opened here with the browser's own inflate.

/** Table rows; the first row holds the field names. */
export type Rows = string[][];

export function parseDelimited(text: string): Rows {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => first.split(c).length - 1;
  const delim = count("\t") > count(",") && count("\t") >= count(";") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: Rows = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return tidy(rows);
}

/** Drops empty rows and pads every row to the header's width. */
function tidy(rows: Rows): Rows {
  const out = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const w = out.length ? Math.max(...out.map((r) => r.length)) : 0;
  return out.map((r) => (r.length < w ? [...r, ...Array(w - r.length).fill("")] : r));
}

/** Rows as CSV text (comma, quotes where needed), as VectorCraft's dataset.import reads it. */
export function toCsv(rows: Rows): string {
  const q = (s: string) => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

// ---------- .xlsx ----------

const dec = new TextDecoder("utf-8");

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter();
  void w.write(data as BufferSource);
  void w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function unzip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This is not an .xlsx file.");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true);
    const el = dv.getUint16(p + 30, true);
    const cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    const lnl = dv.getUint16(off + 26, true);
    const lel = dv.getUint16(off + 28, true);
    const start = off + 30 + lnl + lel;
    const raw = buf.subarray(start, start + csize);
    files.set(name, method === 0 ? raw : await inflateRaw(raw));
  }
  return files;
}

const unxml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

/** The text of all <t> elements inside one XML fragment (rich text has several). */
function texts(xml: string): string {
  let s = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += m[1];
  return unxml(s);
}

const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref.replace(/[^A-Za-z]/g, "").toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

export async function readXlsx(bytes: Uint8Array): Promise<Rows> {
  const files = await unzip(bytes);
  const text = (n: string) => (files.has(n) ? dec.decode(files.get(n)!) : "");

  const shared: string[] = [];
  for (const m of text("xl/sharedStrings.xml").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) shared.push(texts(m[1]));

  // the first sheet of the workbook
  let sheetPath = "";
  const wb = text("xl/workbook.xml");
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  if (rid) {
    for (const m of text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      if (new RegExp(`\\bId="${rid}"`).test(m[1])) {
        const t = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
        if (t) sheetPath = t.startsWith("/") ? t.slice(1) : "xl/" + t;
      }
    }
  }
  if (!files.has(sheetPath)) sheetPath = [...files.keys()].filter((k) => k.startsWith("xl/worksheets/")).sort()[0] ?? "";
  if (!sheetPath) throw new Error("No worksheet found in the .xlsx file.");

  const rows: Rows = [];
  for (const r of text(sheetPath).matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const c of (r[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Za-z]+\d+)"/.exec(c[1])?.[1] ?? "";
      const type = /\bt="([^"]+)"/.exec(c[1])?.[1] ?? "";
      const body = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val = "";
      if (type === "s") val = shared[Number(v)] ?? "";
      else if (type === "inlineStr") val = texts(body);
      else if (v !== undefined) val = unxml(v);
      const ci = ref ? colIndex(ref) : row.length;
      while (row.length < ci) row.push("");
      row[ci] = val;
    }
    rows.push(row);
  }
  return tidy(rows);
}

/** Text of a data file: UTF-16 (Excel's "Unicode Text") or UTF-8, else Windows-1252 (old "CSV"). */
export function decodeText(buf: Uint8Array): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/** Reads a chosen data file (.csv, a Unicode .txt, .tsv or .xlsx). */
export async function readDataFile(file: File): Promise<Rows> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (/\.xlsx$/i.test(file.name)) return readXlsx(buf);
  return parseDelimited(decodeText(buf));
}
