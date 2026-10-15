# Smart Pre-Press v0.8 — Integrated Editor + Data Merge

এই সংস্করণে v0.5-এর workflow-first screen, v0.6-এর CSV/XLSX Data Merge এবং v0.7-এর editor tools একসঙ্গে রাখা হয়েছে।

## ফিচার
- প্রথম স্ক্রিন: Only Layout / Layout & Output
- Template import: AI, EPS, PDF, SVG নির্বাচন
- PDF/SVG প্রিভিউ; AI/EPS ফাইল নির্বাচিত হয়, কিন্তু এই prototype-এ সরাসরি artwork render/edit হয় না
- Select, Text, Rectangle, Line, Delete, Duplicate
- Move, resize, properties, font, size, color, bold
- Layers list, zoom, undo/redo, keyboard shortcuts
- CSV এবং XLSX/XLS import (SheetJS)
- Text object-কে data column-এর সঙ্গে bind করে record preview
- Current record SVG export
- সব data record-এর SVG overlay proof ZIP export
- Project `.spp` হিসেবে save/open; artwork file data URL-ও project-এ অন্তর্ভুক্ত হতে পারে

## Windows installer build
GitHub-এ ফাইলগুলো একই directory structure-এ রাখুন এবং Actions workflow চালান। `package.json`-এ `dist` command-এ `--publish never` রয়েছে, তাই GitHub token লাগে না।

## গুরুত্বপূর্ণ সীমাবদ্ধতা
এটি একটি বাস্তবায়নযোগ্য prototype, পূর্ণ Illustrator replacement নয়। AI/EPS/PDF-এর মূল অবজেক্ট সরাসরি সম্পাদনা করা হয় না। বর্তমান SVG/ZIP export-এ editable overlay objects ও merged text থাকে; মূল artwork embedded নয়। Production-ready composite PDF/AI/EPS, native barcode/QR generation, cutting marks, Auto UPS এবং costing পরবর্তী ধাপে তৈরি করতে হবে।

## v0.9 — PDF ও নিজস্ব Project Format
- বর্তমান রেকর্ড PDF হিসেবে Save Current PDF বোতাম দিয়ে সেভ করা যায়।
- সব Data Merge রেকর্ড একাধিক পৃষ্ঠার PDF হিসেবে Save All Records PDF দিয়ে সেভ করা যায়।
- Save Project দিয়ে নিজস্ব `.spp` ফরম্যাটে কাজ সেভ হয় এবং Open Project দিয়ে আবার খোলা যায়।
- সীমাবদ্ধতা: PDF Export-এ বর্তমানে Editor overlay objects ও merged text থাকে; আমদানি করা মূল AI/EPS/PDF artwork-কে PDF-তে embed/flatten করা এখনো বাস্তবায়িত হয়নি।
