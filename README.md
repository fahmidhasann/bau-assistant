# BAU সহকারী

বাংলাদেশ কৃষি বিশ্ববিদ্যালয়ের শিক্ষক যোগাযোগ, পরিবহন ও জরুরি তথ্যের জন্য একটি Bengali-first Next.js assistant। উত্তর দেওয়ার সময় ফোন, ইমেইল ও উৎস সরাসরি যাচাই করা local snapshot থেকে আসে; AI কখনো contact data তৈরি করে না।

## চালু করুন

```bash
npm install
cp .env.example .env.local
npm run dev
```

তারপর [http://localhost:3000](http://localhost:3000) খুলুন। `OPENROUTER_API_KEY` না থাকলেও teacher, bus ও emergency structured lookup কাজ করবে। Key থাকলে অস্পষ্ট প্রশ্ন classify করার fallback চালু হবে।

## ডেটা আপডেট

- `src/data/curated.json`: human-verified bus ও emergency records। বর্তমানে ইচ্ছাকৃতভাবে inactive placeholder আছে; যাচাই ছাড়া কোনো নম্বর যোগ করবেন না।
- `src/data/faculty.generated.json`: BAU Entomology directory snapshot।
- `npm run sync:data`: official BAU directory থেকে teacher snapshot refresh করে। এর জন্য server-side `BAU_SYNC_API_KEY` প্রয়োজন। Sync অসম্পূর্ণ বা ব্যর্থ হলে আগের snapshot অক্ষত থাকে।

একটি active curated record-এর সাধারণ গঠন:

```json
{
  "id": "general-bus-campus-town",
  "kind": "bus",
  "title": "ক্যাম্পাস–শহর জেনারেল বাস",
  "aliases": ["জেনারেল বাস", "campus town bus"],
  "schedule": [
    {
      "route": "ক্যাম্পাস → শহর",
      "days": ["রবি–বৃহস্পতি"],
      "departures": ["08:00", "14:30"],
      "notes": "ছুটির দিনে প্রযোজ্য নয়"
    }
  ],
  "sourceUrl": "https://transport.bau.edu.bd/section/general-bus-schedule",
  "sourceType": "curated",
  "verifiedAt": "2026-08-21",
  "status": "active"
}
```

Emergency record-এ একইভাবে `phone` যোগ করুন। সময় বা নম্বর অবশ্যই BAU-এর দায়িত্বশীল ব্যক্তি দিয়ে যাচাই করুন।

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests Bengali, Banglish, English, fuzzy names, ambiguity, unavailable data, no-fabrication এবং official-source enforcement কভার করে।

## Vercel

1. project-টি GitHub-এ push করে Vercel-এ import করুন।
2. Root Directory হিসেবে `bau-assistant` নির্বাচন করুন যদি parent workspace push করেন।
3. `OPENROUTER_API_KEY`, `OPENROUTER_MODEL=openrouter/free` এবং production `NEXT_PUBLIC_APP_URL` environment variables দিন।
4. Build command `npm run build`; output auto-detected হবে।

OpenRouter key browser bundle-এ যায় না; এটি শুধু `app/api/chat` server route ব্যবহার করে।
