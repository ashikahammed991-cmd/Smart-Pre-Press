# Smart Pre-Press v0.4 — Editor Prototype

## এই সংস্করণে
- Field Mapping পেজ সরিয়ে সরাসরি Template Editor workspace।
- Template import করলে editor workspace-এ preview/overlay tools পাওয়া যায়।
- PDF ও SVG preview; AI/EPS ফাইল বাছাই করা যায়, তবে built-in preview-তে নির্ভরযোগ্যভাবে রেন্ডার হয় না। AI/EPS-এর PDF/SVG preview export করে import করুন।
- Select, Text, Rectangle, Line, Delete tools।
- Text-এর font family, size, color, bold পরিবর্তন।
- Undo/Redo buttons এবং Ctrl+Z / Ctrl+Y shortcut।
- CSV import করে header/প্রথম রেকর্ডের preview।
- Layout ও Output আলাদা workflow tabs।

## গুরুত্বপূর্ণ সীমাবদ্ধতা
এটি এখনো Illustrator-এর পূর্ণ বিকল্প নয়। Original AI/EPS/PDF ফাইলের ভেতরের objects সরাসরি edit হয় না; PDF/SVG-র ওপর editable overlay objects তৈরি হয়। এই prototype-এ project save/open, XLSX parsing, barcode/QR generation, permanent artwork export, Auto UPS, cutting marks, mixed-size plate logic এবং costing এখনো নেই।

## Windows build
Repository-তে `src/index.html`, `src/app.js`, `src/styles.css`, `main.js`, `package.json` এবং `.github/workflows/build-windows.yml` সঠিক path-এ রাখুন। GitHub Actions workflow সফল হলে Artifact থেকে Windows installer ডাউনলোড করুন।
