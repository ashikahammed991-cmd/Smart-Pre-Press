# Smart Pre-Press v1.0 — File মেনু, PDF ও Project Save

## নতুন সুবিধা
- সব Save/Open কাজ এখন **File** মেনুর ভিতরে।
- **Save Current as PDF** বর্তমান রেকর্ডকে সাধারণ PDF ফাইলে সেভ করে।
- **Save All Records as PDF** সব রেকর্ডকে একাধিক পৃষ্ঠার একটি PDF ফাইলে সেভ করে।
- **Save Project (.spp)** সফটওয়্যারের নিজস্ব ফরম্যাটে কাজ সেভ করে; **Open Project** দিয়ে পরে আবার খোলা যায়।
- আগের Only Layout / Layout & Output, Editor, CSV/XLSX Import, Data Binding এবং Undo/Redo রাখা হয়েছে।

## GitHub-এ আপডেট
1. ZIP Extract করো।
2. Repository-তে `src/index.html`, `src/app.js`, `src/styles.css` এবং `package.json` একই path-এ আপডেট করো। `main.js` ও `.github/workflows/build-windows.yml` আগের মতো রাখো।
3. Commit করে **Actions** ট্যাবে Build সফল হওয়া পর্যন্ত অপেক্ষা করো। তারপর Windows installer artifact ডাউনলোড করো।

## গুরুত্বপূর্ণ সীমাবদ্ধতা
- Export করা PDF একটি সাধারণ PDF; Adobe Acrobat-এর নিজস্ব/বিশেষ ফরম্যাট নয়। সাধারণ PDF viewer-এ খোলার জন্য তৈরি।
- এই পর্যায়ে PDF-তে Editor-এর overlay text/shape এবং merged text থাকে; Import করা মূল AI/EPS/PDF artwork এখনো PDF-তে একসঙ্গে বসানো হয় না।
- মূল artwork অক্ষত রেখে PDF composition, AI/EPS rendering, Auto UPS, Cutting Marks, Barcode/QR ও চূড়ান্ত production output পরবর্তী ধাপে করতে হবে।

## পরবর্তী কাজ
১. মূল artwork-কে PDF-এর background হিসেবে রেখে merged text/shape বসানো।
২. AI/EPS ফাইলের নিরাপদ preview pipeline।
৩. Auto UPS, spacing, mixed-size layout, cutting marks ও multi-plate output।
৪. Barcode/QR generation এবং output validation।
