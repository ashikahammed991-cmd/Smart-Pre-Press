# Smart Pre-Press

Press automation for print shops: drop in the customer PDFs, type the quantities, and get the **ups, the paper ratio, the cost and a print-ready imposed PDF** for CTP.

## What it does (v1.0)

1. **Add PDFs or a whole folder.** The trim size comes from each PDF's TrimBox (MediaBox if there is none) and `/Rotate` is respected.
2. **Type the quantity** for every job.
3. **You type the ups once**, as columns × rows (e.g. 3 × 6 = 18), above the job list. Every PDF is laid out in exactly that grid; you only type the quantity per PDF. The program works out the rest:
   - *Auto press sheet*: the sheet is cut from the parent sheet in equal pieces, as small as the ups allow (between your smallest and largest machine sheet). The **ratio** (press sheets per parent) follows from that. Or choose a fixed sheet size.
   - *Each job on its own sheet*, or *gang run* where jobs share a sheet when that costs less (each job keeps the ups you typed).
   - **Cut marks** are placed at every cut: vertical ticks at the top and bottom for the vertical cuts, horizontal ticks at the left and right for the horizontal cuts.
4. **Costing**: paper (parent sheets needed × price, from the ratio, plus make-ready and spoilage sheets), plates, make-ready, machine run, finishing, overhead and profit. The cost of a sheet set is shared between its jobs by the sheet area they use, so you get a cost and a price per piece for every job. Export it as CSV.
5. **Export plate PDF**: one page per sheet side. Front/back jobs (PDFs with two pages) are imposed work-and-turn (the back is mirrored left-to-right). Each page has cut ticks, registration targets, a CMYK colour bar and a slug line.

The artwork is **not re-rendered**: pages are embedded as they are, so vectors stay vectors and images keep their full resolution and their colour spaces.

## Settings

Everything is in millimetres: press sheet, gripper, margins, bleed, gap, parent sheet, ratio (0 = calculated from the sizes), spoilage, plates, machine rates, finishing, overhead and profit percentages, currency symbol. Settings are remembered between runs.

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
