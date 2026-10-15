# Smart Pre-Press v0.3 — Template Preview & Manual Field Placement

## এই আপডেটে
- CSV import এবং column mapping আগের মতো আছে।
- PDF template preview দেখানোর চেষ্টা করে; SVG preview-ও সমর্থিত।
- Mapping পেজে template-এর ওপর ক্লিক করে SKU, Size, Price, Barcode, QR বা custom field বসানো যায়।
- প্রতিটি placed field-এর font family, font size, color ও bold সেট করা যায়।
- Field নির্বাচন করে Remove selected দিয়ে মুছে ফেলা যায়।
- Original AI/EPS/PDF artwork ফাইল পরিবর্তন করা হয় না।

## গুরুত্বপূর্ণ সীমাবদ্ধতা
- Chromium/Electron ব্রাউজারে AI/EPS ফাইল নির্ভরযোগ্যভাবে preview করা যায় না। সঠিক artwork-এর ওপর field বসাতে Illustrator থেকে একই design-এর PDF বা SVG preview export করে সেটি নির্বাচন করুন।
- PDF preview-এর ওপর overlay অবস্থান prototype পর্যায়ের; PDF viewer-এর zoom/scroll বদলালে overlay alignment বদলাতে পারে।
- এই build এখনো placed fields-কে মূল AI/EPS/PDF-এর মধ্যে embed করে না এবং final production PDF/AI export করে না।
- XLSX parsing, barcode/QR graphic generation, Auto UPS, cutting marks, costing ও production export পরবর্তী ধাপ।

## GitHub-এ আপডেট
Repository-র root-এর `main.js`, `package.json` অপরিবর্তিত রাখুন। এই ZIP থেকে `src/index.html`, `src/app.js`, `src/styles.css` এবং `README_BN.md` প্রতিস্থাপন করুন। এরপর Commit changes করুন, Actions-এ সবুজ টিক আসলে Artifact ডাউনলোড করুন।
