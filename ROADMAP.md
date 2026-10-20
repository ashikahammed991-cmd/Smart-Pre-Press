# Smart Pre-Press Roadmap

Smart Pre-Press is an open-source vector graphics editor in the same family as Illustrator, Inkscape and Affinity Designer.
It is an independent project and uses none of Adobe's code, branding or assets.
A full professional editor is built in stages; each stage ships as a GitHub Release.

## v0.1 (this repo) - the foundation
- [x] Artboard, rectangle / ellipse / line tools
- [x] Pen tool with bezier handles, close path
- [x] Select + move, delete, layer order
- [x] Fill, stroke colour, stroke width
- [x] Undo / redo
- [x] Save/open project (.spp), export SVG
- [x] Windows / macOS / Linux builds through GitHub Actions

## v0.2 - editing precision
- [x] Zoom and pan (wheel, space+drag)
- [x] Resize handles
- [x] Rotate handle, multi-select, marquee select
- [ ] Direct selection: move anchors and handles of existing paths
- [ ] Snapping, guides, rulers, grid
- [x] Copy / paste / duplicate
- [ ] Group / ungroup

## v0.3 - layers and appearance
- [ ] Real layers panel: names, visibility, lock, nesting
- [ ] Gradients, opacity, dashed strokes, blend modes
- [ ] Align and distribute
- [ ] Multiple artboards

## v0.4 - pre-press basics (done)
- [x] Page size presets, custom size, bleed
- [x] CMYK fill and stroke
- [x] Print PDF export with TrimBox/BleedBox and crop marks

## v0.5 - pre-press, next
- [ ] ICC colour profiles (e.g. FOGRA39, SWOP) and soft-proofing
- [ ] Spot colours / Pantone-style swatches and a swatches panel
- [ ] Overprint, rich-black warnings, total ink limit check
- [ ] Preflight report (missing bleed, low resolution, RGB leftovers)
- [ ] Registration marks, colour bars, page info slug

## v0.6 - text and import
- [ ] Text tool, fonts, text on path
- [ ] Import SVG and raster images
- [ ] Export PNG at chosen resolution

## v0.7 - path operations
- [ ] Pathfinder: union, subtract, intersect, exclude
- [ ] Offset path, simplify, outline stroke
- [ ] Pencil / brush tool with smoothing
- [ ] Anchor add / delete / convert

## Later
- [ ] Symbols and reusable components
- [ ] Image trace
- [ ] Plugin API
- [ ] Performance: move the geometry engine to Rust (WASM or native)
