# Smart Pre-Press — Source Project

## Windows installer তৈরি
1. GitHub repository-তে এই ZIP-এর source files upload/replace করো।
2. `.github/workflows/build-windows.yml` workflow চালাও (অথবা source push করলে workflow automatic চালু হলে অপেক্ষা করো)।
3. GitHub-এর **Actions** → successful run → **Artifacts** থেকে Windows build download করো।

## এই সংস্করণে
- PDF-এর প্রথম পৃষ্ঠা visual reference হিসেবে import/render করা যায় (PDF.js)।
- PDF-compatible AI ফাইল হলে সেটিও preview হতে পারে।
- SVG artwork visual reference হিসেবে artboard-এ দেখায়।
- imported artwork-এর উপরে যোগ করা text/shape overlay আলাদাভাবে edit করা যায়।
- CSV/XLSX data merge এবং artboard/overlay tools আগের মতো রয়েছে।

## গুরুত্বপূর্ণ সীমাবদ্ধতা
- PDF/SVG/AI-এর original artwork এখনো আলাদা আলাদা native editable object-এ convert হয় না; original artwork visual reference, আর নতুন overlay objects edit করা যায়।
- EPS সরাসরি preview হয় না। Illustrator-এ EPS খুলে PDF হিসেবে export করে PDF import করো।
- PDF export এখনো imported original artwork-সহ final print PDF তৈরি করে না; overlay objects export করে।
- এই source-এ Electron build-এর জন্য GitHub Actions-এ dependencies install করতে হবে।
