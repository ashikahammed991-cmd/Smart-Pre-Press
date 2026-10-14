# Smart Pre-Press — Browser Build Starter

এই প্রজেক্টটি HTML/CSS/JavaScript + Electron দিয়ে Windows ডেস্কটপ অ্যাপ বানানোর starter।
কোডিং ব্রাউজারে করা যাবে; নিজের কম্পিউটারে Python বা Node.js ইনস্টল করা বাধ্যতামূলক নয়।
GitHub Actions Windows installer build করবে।

## ব্রাউজার থেকে ব্যবহার
1. GitHub-এ একটি নতুন repository তৈরি করুন: `Smart-PrePress`
2. এই ZIP-এর ফাইলগুলো repository-তে upload করুন।
3. GitHub repository-তে `Actions` tab খুলুন এবং workflow run/finish হওয়া পর্যন্ত অপেক্ষা করুন।
4. সফল build হলে workflow run-এর নিচে `Artifacts` থেকে `Smart-PrePress-Windows-Installer` ZIP ডাউনলোড করুন।
5. ZIP খুলে `.exe` installer চালান।

## কোড এডিট
- `src/index.html` — অ্যাপের UI
- `src/styles.css` — ডিজাইন
- `src/app.js` — UI interactions
- `main.js` — Electron desktop window
- `.github/workflows/build-windows.yml` — cloud Windows build

## এই starter-এ এখন যা আছে
- Master Tag ফাইল বাছাই: AI/EPS/PDF
- CSV/Excel ফাইল বাছাই UI (CSV preview বাস্তবভাবে কাজ করে; XLSX parsing-এর জন্য পরের ধাপে SheetJS যোগ করতে হবে)
- CSV header ও row preview
- Mapping mode: existing object/text নির্বাচন বা field box আঁকার জন্য UI
- Only Layout / Layout & Output mode selector
- UPS ও spacing controls-এর প্রাথমিক UI

## গুরুত্বপূর্ণ সীমাবদ্ধতা
এটি এখনো পূর্ণ pre-press production engine নয়। AI/EPS/PDF artwork-এ সরাসরি নিরাপদ text replacement, barcode/QR generation, mixed-size imposition, cutting marks এবং costing এখনো যোগ করা হয়নি। AI/EPS-এর পূর্ণ editing browser-only JavaScript দিয়ে সহজে সম্ভব নয়; প্রথমে PDF-compatible preview/export workflow বানানো সবচেয়ে নির্ভরযোগ্য পথ।
