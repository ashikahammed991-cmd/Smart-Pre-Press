# Smart Pre-Press v1.8 — AI / EPS / PDF Import Foundation

এই সংস্করণে SVG workflow বাদ দিয়ে AI, EPS ও PDF ফাইলকে অগ্রাধিকার দেওয়া হয়েছে।

## বর্তমান সক্ষমতা
- PDF ফাইলের প্রথম পৃষ্ঠা visual reference হিসেবে render করা।
- PDF-compatible AI ফাইল preview করার চেষ্টা করা।
- EPS ফাইল নির্বাচন করা যায়; এই সংস্করণে EPS সরাসরি render হয় না। EPS preview-এর জন্য Illustrator থেকে PDF export করে import করতে হবে।
- Artboard-এর ওপর আলাদা editable overlay text/shape যোগ করা, সরানো ও পরিবর্তন করা যায়।
- CSV/XLSX data merge prototype, project save/open এবং basic overlay PDF export।

## গুরুত্বপূর্ণ সীমাবদ্ধতা
এটি এখনো Adobe Illustrator-এর মতো native vector editor নয়। Imported PDF/AI ফাইলের সব original paths, anchor points, layers, text, gradients বা groups আলাদা করে edit করা যায় না। Exported PDF-তে imported original artwork এখনো embedded হয় না; overlay objects export হয়। EPS direct rendering-ও এখনো নেই।

## Windows installer build
GitHub Actions workflow `Build Smart Pre-Press Windows Installer` চালাও। Build সফল হলে `dist/*.exe` artifact download করো।

এই সোর্সে JavaScript syntax পরীক্ষা করা হয়েছে; Windows installer বাস্তবে চালিয়ে পরীক্ষা করা হয়নি।


## v1.9 আপডেট
- PDF-compatible PDF/AI থেকে পাওয়া প্রথম পৃষ্ঠার ভিজ্যুয়াল প্রিভিউ এখন Save Current as PDF এবং Save All Records as PDF-এ ব্যাকগ্রাউন্ড হিসেবে যোগ হয়।
- PDF export আর্টবোর্ডের নির্ধারিত width/height ব্যবহার করে; overlay টেক্সট/শেপ তার ওপর বসে।
- `.spp` প্রজেক্টে artwork preview-ও সংরক্ষিত হয়, ফলে প্রজেক্ট পুনরায় খুললে প্রিভিউ ফিরে আসতে পারে।
- সীমাবদ্ধতা: ব্যাকগ্রাউন্ডটি raster preview, মূল PDF vector objects নয়। AI কেবল PDF-compatible হলে; EPS-এর জন্য এখনও PDF conversion দরকার।


## v2.0 আপডেট
- Rectangle, Ellipse, Line ও Text অবজেক্ট তৈরি/এডিট করা যায়।
- Shape-এর Stroke এবং Fill রং বেছে নেওয়া যায়।
- SVG/PDF export-এ ellipse shape সমর্থন যোগ হয়েছে।
- সীমাবদ্ধতা: AI/EPS/PDF-এর মূল ফাইলের সব ভেক্টর অবজেক্ট এখনো সরাসরি এডিটযোগ্য নয়; PDF/AI প্রিভিউ আলাদা রেফারেন্স লেয়ার। EPS প্রিভিউয়ের জন্য PDF conversion প্রয়োজন।
