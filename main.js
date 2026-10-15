# Smart Pre-Press v0.5 (Workflow-first Editor Prototype)

## নতুন UX
- অ্যাপ খুললে প্রথমে দুটি পছন্দ: **Only Layout** এবং **Layout & Output**।
- যেকোনো workflow বেছে নেওয়ার পর Template Import স্ক্রিন আসে।
- Template নির্বাচন করলে Editor Workspace খোলে।
- Illustrator-inspired layout: বাম পাশে tools/layers, মাঝখানে artboard, ডানে properties, উপরে toolbar এবং Undo/Redo।
- Undo/Redo buttons এবং Ctrl+Z / Ctrl+Y।
- CSV import এবং text/shape overlay tools আগের prototype-এর মতোই আছে।

## GitHub-এ আপডেট
ZIP Extract করে `src/index.html`, `src/app.js`, `src/styles.css`, `package.json` এবং `README_BN.md` আপডেট করো। `main.js` ও `.github/workflows/build-windows.yml` আগের মতো রাখো। Commit করার পর Actions-এ নতুন Build সফল হলে Artifact থেকে Windows installer নামাও।

## সীমাবদ্ধতা
এটি Illustrator-inspired UI prototype, Adobe Illustrator-এর পূর্ণ বিকল্প নয়। PDF/SVG preview করা যায়; AI/EPS preview, native artwork object editing, production-ready merge/export, Auto UPS, cutting marks ও costing এখনও পরবর্তী ধাপের কাজ।
