# Smart Pre-Press v0.6 — Excel Data Merge প্রোটোটাইপ

## নতুন ফিচার
- প্রথমে Only Layout / Layout & Output নির্বাচন
- PDF/SVG টেমপ্লেট প্রিভিউ; AI/EPS ফাইল নির্বাচন করা যায়, তবে সরাসরি প্রিভিউ/এডিট করা যায় না
- Select, Text, Rectangle, Line, Delete টুল
- ফন্ট, সাইজ, রং, Bold, Position ও Size সেটিংস
- Undo/Redo এবং Ctrl+Z / Ctrl+Y
- CSV এবং Excel XLSX/XLS Import (প্রথম worksheet)
- নির্বাচিত Text-কে Excel/CSV কলামের সঙ্গে Bind করা
- রেকর্ড বদলে Merge Preview দেখা
- একটি রেকর্ডের overlay proof SVG হিসেবে Export

## গুরুত্বপূর্ণ সীমাবদ্ধতা
এটি একটি বাস্তবায়নযোগ্য প্রোটোটাইপ, সম্পূর্ণ Illustrator বিকল্প নয়। মূল AI/EPS/PDF অবজেক্ট সরাসরি এডিট করে না। PDF iframe-এ ও SVG image preview-তে দেখা যায়। বর্তমানে SVG proof export-এ শুধু editor overlay থাকে; মূল artwork embed হয় না। সব রেকর্ডের production imposition, barcode/QR, cutting marks, native artwork preservation এবং সম্পূর্ণ production PDF export পরবর্তী কাজ। প্রিন্টের আগে আকার ও আউটপুট যাচাই করতে হবে।

## GitHub-এ আপডেট
`main.js` ও `package.json` root-এ রাখবে। `src/index.html`, `src/app.js`, `src/styles.css` `src/`-এ রাখবে এবং workflow `.github/workflows/build-windows.yml`-এ রাখবে। Commit করে Actions থেকে সফল build artifact ডাউনলোড করবে।
