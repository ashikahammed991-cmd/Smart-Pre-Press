// Copies the Vector Editor (VectorCraft web build, put in ./editor-src by the release workflow)
// into dist/vectorcraft after Vite has built the app. Does nothing when editor-src is absent.
import { cpSync, existsSync } from "node:fs";

if (existsSync("editor-src/index.html")) {
  cpSync("editor-src", "dist/vectorcraft", { recursive: true });
  console.log("Vector Editor copied to dist/vectorcraft");
} else {
  console.log("editor-src not found: building without the Vector Editor");
}
