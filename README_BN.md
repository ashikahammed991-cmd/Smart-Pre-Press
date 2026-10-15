# Smart Pre-Press — Windows Test Build (Source ZIP)

এই ZIP-এ GitHub Actions দিয়ে Windows installer (`.exe`) বানানোর জন্য প্রয়োজনীয় Electron source code ও workflow আছে। এটি **পরীক্ষামূলক build**, production-certified সম্পূর্ণ pre-press suite নয়।

## এই build-এ যা আছে
- Only Layout / Layout & Output workflow selection
- Editor workspace ও PDF/SVG preview
- Text/rectangle/line overlay object যোগ, select, move/resize, duplicate, delete
- Undo/Redo
- CSV/XLSX data import এবং text field binding / record preview
- Basic UPS layout ও cutting-mark overlay
- Project `.spp` save/open
- Standard PDF export options
- GitHub Actions workflow দিয়ে Windows installer build

## গুরুত্বপূর্ণ সীমাবদ্ধতা
- AI/EPS ফাইলের native vector/text content-কে Illustrator-এর মতো সরাসরি edit করার পূর্ণ engine এতে নেই। PDF/SVG preview ও overlay editing-ই এই prototype-এর বর্তমান সীমা।
- UPS/cutting marks ও PDF export-কে production artwork-এ ব্যবহারের আগে sample file দিয়ে যাচাই করতে হবে।
- তাই এই ZIP-কে final production-ready software হিসেবে ধরে নেওয়া যাবে না; আগে test build চালিয়ে ফল যাচাই করুন।

## GitHub-এ যোগ করার নিয়ম
1. ZIP extract করুন।
2. Extract করা project folder-এর **ভেতরের সব ফাইল ও folder** আপনার `Smart-Pre-Press` GitHub repository-র root-এ upload/replace করুন।
3. `.github/workflows/build-windows.yml` ফাইলটি আছে কি না নিশ্চিত করুন।
4. GitHub → **Actions** → **Build Smart Pre-Press Windows Installer** → **Run workflow** চাপুন (অথবা `main` branch-এ commit/push হলে workflow চলবে)।
5. সফল হলে workflow run-এর নিচে **Artifacts** থেকে `Smart-PrePress-Windows-Installer` ZIP ডাউনলোড করুন; তার ভেতরে `.exe` থাকবে।

## স্থানীয়ভাবে চালানো (ঐচ্ছিক)
Node.js 22 ইনস্টল করা কম্পিউটারে project folder খুলে terminal-এ চালান:
`npm install`
`npm start`

Installer বানাতে:
`npm run dist`

**সতর্কতা:** পুরোনো ফাইল replace করার আগে repository-র একটি backup রাখুন।


## v1.3 UI refresh
- রেফারেন্স স্ক্রিনশট অনুসারে ডার্ক নেভি ওয়ার্কস্পেস স্টাইল আপডেট।
- এটি এখনো প্রোটোটাইপ: PDF/SVG preview এবং overlay object editing; AI/EPS-এর native vector editing নয়।
- UPS layout বর্তমানে নির্বাচিত editable overlay object কপি করে; imported PDF-এর ভিতরের আসল artwork নির্বাচন/এম্বেড করে না।
