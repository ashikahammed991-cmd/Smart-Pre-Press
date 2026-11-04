# Roadmap

## v1.0 - press automation (done)
- [x] Add PDFs / folder, trim size from TrimBox, quantity per job
- [x] Step & repeat, gang run, auto (cheaper) planning with rotation
- [x] Parent sheet ratio, paper / plate / machine / finishing costing, per-job cost and price per piece, CSV export
- [x] Imposed composite PDF (vector kept), work-and-turn backs, cut ticks, registration targets, colour bar, slug

## v1.1 - ups typed by the user (done)
- [x] One Ups box (columns × rows, e.g. 3 × 6 = 18) used for every PDF; only the quantity is typed per PDF
- [x] Ratio and press-sheet size worked out from the ups (cut from the parent sheet), per sheet set
- [x] Cut marks for every horizontal and vertical cut

## v1.3 - combine sizes (done)
- [x] The total ups are shared between the sizes; PDFs are merged onto shared plates when that lowers the total cost
- [x] Guillotine (row/column) layouts and cut marks for mixed sizes

## v1.4 - fewest plates (done)
- [x] "Combine for": fewest plates (default) or lowest cost; same-size jobs with different quantities (e.g. sizes 32-40) share one plate set

## v1.5 - same ups and sheet on every plate (done)
- [x] Every plate set carries exactly the typed total ups, on one press sheet / ratio for the whole job

## Next
- [ ] Separate C / M / Y / K plate PDFs (bundled separation engine)
- [ ] Several press-sheet sizes: pick the cheapest automatically
- [ ] Hot folder: watch a folder and plan automatically
- [ ] Saved jobs / customers, quotation PDF
- [ ] Booklet and signature imposition (multi-page jobs)
- [ ] Per-job colour counts (spot colours, 1-colour jobs on a 4-colour sheet)
- [ ] Plate bending / punch offsets, CTP plate size presets
