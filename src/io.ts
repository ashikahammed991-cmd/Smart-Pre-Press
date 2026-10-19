import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Save text to disk: native dialog in the desktop app, download in a plain browser. */
export async function saveText(defaultName: string, text: string, ext: string, label: string): Promise<boolean> {
  if (isTauri) {
    const path = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] });
    if (!path) return false;
    await writeTextFile(path, text);
    return true;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Let the user pick a text file and return its contents (or null if cancelled). */
export async function openText(ext: string, label: string): Promise<string | null> {
  if (isTauri) {
    const path = await open({ multiple: false, filters: [{ name: label, extensions: [ext] }] });
    if (!path || Array.isArray(path)) return null;
    return await readTextFile(path);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${ext}`;
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    };
    input.click();
  });
}
