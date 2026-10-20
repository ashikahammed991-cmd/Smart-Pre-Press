# Smart Pre-Press

An open-source desktop vector graphics editor built with **Tauri + TypeScript**.
Draw shapes, build curves with the pen tool, organise layers, and export clean SVG.

> Smart Pre-Press is an independent project. It is not affiliated with Adobe.

## Features (v0.1)

- Rectangle, ellipse, line and pen (bezier) tools
- Select, move, delete, bring forward / send backward
- Fill, stroke colour and stroke width
- Resize handles (hold Shift on a corner to keep proportions)
- Zoom (mouse wheel) and pan (Space + drag, or middle mouse button)
- Copy, paste, duplicate, arrow-key nudging
- Undo / redo
- Save and open projects (`.spp`), export SVG
- Runs on Windows, macOS and Linux

## Shortcuts

| Key | Action |
| --- | --- |
| V / R / E / L / P | Select / Rect / Ellipse / Line / Pen |
| Enter or double-click | Finish an open pen path |
| Click first point | Close the pen path |
| Del | Delete selection |
| Ctrl+C / Ctrl+V / Ctrl+D | Copy / paste / duplicate |
| Arrow keys (Shift = 10x) | Nudge selection |
| Mouse wheel | Zoom at the cursor |
| Space + drag | Pan |
| Ctrl+0 / Ctrl++ / Ctrl+- | Reset / zoom in / zoom out |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S / Ctrl+O / Ctrl+E | Save / open / export SVG |

Pen tool: click to add a corner point, click-and-drag to pull out a curve handle.

## Run it

You need [Node.js 20+](https://nodejs.org) and, for the desktop app, [Rust](https://rustup.rs)
plus the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri icon app-icon.png   # one time: generates src-tauri/icons
npm run tauri dev                 # desktop app
# or just the web preview:
npm run dev                       # http://localhost:1420
```

No setup on your machine? Open the repo in **GitHub Codespaces** (Code -> Codespaces -> Create).
The web preview works there out of the box.

## Build installers with GitHub

1. Push this project to a GitHub repository.
2. Create a tag and push it:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. The **Release** workflow builds Windows, macOS and Linux installers and attaches them to a draft
   release under *Releases*. Review it and press **Publish**.

The **CI** workflow type-checks and builds the frontend on every push and pull request.

## Project layout

```
src/model.ts     document model + SVG serialisation
src/editor.ts    tools, selection, undo/redo, rendering
src/io.ts        save/open (native dialogs in Tauri, browser fallback)
src/main.ts      UI wiring
src-tauri/       Rust shell (Tauri)
.github/         CI and release workflows
```

See [ROADMAP.md](ROADMAP.md) for what is planned. License: MIT.
