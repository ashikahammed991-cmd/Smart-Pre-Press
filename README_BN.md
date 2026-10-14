# Smart Pre-Press — Version 0.2 (Field Mapping Prototype)

এটি Smart Pre-Press Windows desktop app-এর পরবর্তী prototype। Electron app GitHub Actions-এর Windows runner দিয়ে build করা যায়; নিজের কম্পিউটারে Node.js ইনস্টল করা বাধ্যতামূলক নয়।

## এই সংস্করণে কাজ করে
- Master Tag ফাইল নির্বাচন (AI/EPS/PDF) — ফাইলটি নির্বাচন/নাম দেখায়; artwork-এর ভিতরের live editing এখনো যুক্ত নয়।
- CSV ফাইল import ও প্রথম কয়েকটি রেকর্ডের preview।
- CSV column থেকে SKU, Size, Price, Barcode value, QR value এবং custom text field mapping নির্বাচন।
- প্রথম data record থেকে mapped value preview।
- Only Layout / Layout & Output workflow নির্বাচন।
- Windows NSIS installer build (GitHub Actions artifact)।

## এখনো তৈরি হয়নি
- XLSX/XLS সরাসরি পড়া (Excel থেকে CSV UTF-8 হিসেবে Save As করে import করুন)।
- AI/EPS/PDF artwork-এর ভিতরে mapped text বসানো বা design editing।
- বাস্তব barcode/QR image generation।
- Auto UPS, mixed-size sheet layout, cutting marks, production export ও costing।

## GitHub-এ আপডেট
ZIP-এর ভিতরের path অক্ষুণ্ণ রেখে প্রয়োজনীয় ফাইলগুলো repository-তে upload/replace করুন:
- `src/index.html`
- `src/app.js`
- `src/styles.css`
- `package.json`

`main.js` এবং `.github/workflows/build-windows.yml` অপরিবর্তিত রাখা যাবে। `package.json`-এ `--publish never` আছে, তাই build-এর সময় GitHub Release token দরকার হবে না।

## Windows installer তৈরি
GitHub repository → Actions → Build Smart Pre-Press Windows Installer। সফল run হলে run page-এর Artifacts অংশ থেকে `Smart-PrePress-Windows-Installer` ZIP ডাউনলোড করুন; ZIP extract করে ভিতরের `.exe` চালান।
