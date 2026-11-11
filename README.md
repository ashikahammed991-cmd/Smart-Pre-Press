# Smart Pre-Press

Press automation for print shops: drop in the customer PDFs, type the quantities, and get the **ups, the paper ratio, the cost and a print-ready imposed PDF** for CTP.

## What it does (v1.0)

1. **Add PDFs or a whole folder.** The trim size comes from each PDF's TrimBox (MediaBox if there is none) and `/Rotate` is respected.
2. **Type the quantity** for every job.
3. **You type the total ups once**, as rows × columns (e.g. 3 × 6 = 18), above the job list, and the quantity of each PDF. The program does the rest:
   - *Combine into shared plates* (default): PDFs are merged onto shared plates. "Combine for: Fewest plates" (default) merges as long as the ups allow, even if that prints more sheets; "Lowest total cost" merges only when that saves money. The ups are shared between the sizes by quantity so every size finishes together. Layouts are always cuttable with straight cuts (rows first, then columns).
   - *Each PDF on its own plates*: every PDF uses all the ups.
   - **Every plate set has exactly the typed total ups and the same press sheet**, so the whole job has one ratio. (Spare ups go to the sizes that need them most.)
   - *Auto press sheet*: the whole job gets the smallest sheet cut from the parent sheet (between your smallest and largest machine sheet) that holds its ups; the **ratio** follows from that. Or choose a fixed sheet size.
   - **Cut marks** at every cut: horizontal ticks (left, right) for the row cuts, vertical ticks (top, bottom) for the column cuts; with mixed sizes each row also gets its own ticks in the bleed gap.
4. **Costing**: paper (parent sheets needed × price, from the ratio, plus make-ready and spoilage sheets), plates, make-ready, machine run, finishing, overhead and profit. The cost of a sheet set is shared between its jobs by the sheet area they use, so you get a cost and a price per piece for every job. Export it as CSV.
5. **Export plate PDF**: one page per sheet side. Front/back jobs (PDFs with two pages) are imposed work-and-turn (the back is mirrored left-to-right). Each page has cut ticks, registration targets, a CMYK colour bar and a slug line.

The artwork is **not re-rendered**: pages are embedded as they are, so vectors stay vectors and images keep their full resolution and their colour spaces.

## Settings

The settings panel shows only the plate layout (like the Illustrator plate dialog): **Rows, Columns, Horizontal GAP, Vertical GAP, Cutting Mark LENGTH, Cutting Mark GAP**, and the total ups. The gap is the distance between trim edges; bleed is shrunk to fit inside it. Everything else (press sheet limits, parent sheet and ratio, plates, machine, finishing, overhead, profit, currency) is under **Advanced**, with sensible defaults. All lengths are in millimetres. Settings are remembered between runs.

## Known limits

- Plates are **composite** CMYK imposed pages. Separate C / M / Y / K plate files need a separation engine and are planned (see ROADMAP.md); a CTP RIP can separate the composite file.
- Only pages 1 (front) and 2 (back) of each PDF are used.
- Every job is one flat piece; booklet / signature imposition is not included yet.
- Cut ticks are drawn at the edges of the printed block; very irregular gang layouts may need the cutter to follow the trim lines.

## Develop

```
npm install
npm run dev       # web preview on http://localhost:1420
npm run tauri dev # desktop app
```

Releases are built by GitHub Actions: push a tag such as `v1.0.0` and installers appear in a draft Release.

The previous Illustrator-style editor is kept in the Git history (tag `v0.8.0`).

MIT licensed.

## v1.7
- **Run** button: nothing is planned until you press Run. Afterwards every plate (sheet side) is shown as an artboard; Export PDF / CSV use exactly these plates. Changing anything marks the result as out of date until Run is pressed again.
- Typed Rows × Columns is now strictly kept (every row has exactly the typed number of columns).
