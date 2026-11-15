// Windows fonts for the Vector Editor. The web editor has no installed fonts of its own, so after
// it has started this reads the font files of the Windows font folders and hands them to the editor
// (window.vectorcraft.addFont, added by scripts/rebrand-vectorcraft.py). They then appear in the
// editor's normal font list.

import { localDataDir, join } from "@tauri-apps/api/path";
import { readDir, readFile } from "@tauri-apps/plugin-fs";

const EXT = /\.(ttf|otf|ttc|otc)$/i;
/** Bigger files (mostly Chinese / Japanese / Korean fonts) would make the editor slow and heavy. */
const MAX_BYTES = 15 * 1024 * 1024;

interface EditorApi {
  addFont?: (bytes: Uint8Array) => number;
}

function editorApi(): EditorApi | null {
  try {
    const f = document.getElementById("vc-frame") as HTMLIFrameElement | null;
    const w = f?.contentWindow as (Window & { vectorcraft?: EditorApi }) | null | undefined;
    return w?.vectorcraft ?? null;
  } catch {
    return null;
  }
}

async function fontPaths(): Promise<string[]> {
  const dirs = ["C:/Windows/Fonts"];
  try {
    dirs.push((await join(await localDataDir(), "Microsoft", "Windows", "Fonts")).replace(/\\/g, "/"));
  } catch {
    /* ignore */
  }
  const out: string[] = [];
  for (const d of dirs) {
    try {
      for (const e of await readDir(d)) if (e.isFile && EXT.test(e.name)) out.push(d + "/" + e.name);
    } catch {
      /* folder missing or not readable */
    }
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function waitEditor(ms = 300_000): Promise<EditorApi | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const api = editorApi();
    if (api?.addFont) return api;
    await new Promise((r) => setTimeout(r, 700));
  }
  return null;
}

/** Loads the Windows fonts into the Vector Editor in the background. */
export function initFonts(): void {
  const nav = document.getElementById("mainnav");
  const status = document.createElement("span");
  status.id = "fonts-status";
  nav?.appendChild(status);

  void (async () => {
    const api = await waitEditor();
    if (!api?.addFont) return;
    let paths: string[] = [];
    try {
      paths = await fontPaths();
    } catch {
      return;
    }
    let added = 0;
    for (let i = 0; i < paths.length; i++) {
      status.textContent = `Fonts ${i + 1}/${paths.length}`;
      try {
        const bytes = await readFile(paths[i]);
        if (bytes.length <= MAX_BYTES && api.addFont(bytes) > 0) added++;
      } catch {
        /* unreadable font: skip */
      }
      if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
    }
    status.textContent = added ? `${added} Windows fonts loaded` : "";
    window.setTimeout(() => (status.textContent = ""), 8000);
  })();
}
