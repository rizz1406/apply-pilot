# Resume Tailor

An AI-powered web app that turns any job description into a tailored, ATS-friendly resume — with a match score, a cover letter, clickable links, and both PDF and LaTeX export. Runs entirely in the browser, free, using your own Google Gemini API key.

![Tech](https://img.shields.io/badge/React-18-61dafb) ![Build](https://img.shields.io/badge/Vite-5-646cff) ![AI](https://img.shields.io/badge/Gemini-configurable-8b6bff)

---

## What it does

Paste a job description (or upload a screenshot of one) and the app uses AI to rewrite and reorder your experience to match that specific role — then gives you a downloadable resume in seconds.

- **Smart tailoring** — rewrites bullets with the job's keywords and strong action verbs, and reorders skills by relevance. Never fabricates metrics, companies, or skills you don't have.
- **Reads screenshots** — upload an image of a job posting and Gemini vision extracts the text automatically.
- **ATS match score** — a 0–100 fit estimate, a list of keywords you cover, and a list of keywords you're missing so you know where the gaps are.
- **Cover letter generator** — a tailored ~200-word letter from your profile and the job, one click.
- **Clickable links** — email, LinkedIn, GitHub, and website in the header, plus per-project repo links and per-certification verification links, all live in the exported PDF.
- **ATS PDF + LaTeX export** — a selectable-text browser PDF for applications, an optional visual PDF, and a `.tex` file for Overleaf.
- **Saved profile** — fill your details once (or auto-fill from an existing resume) and they load automatically every visit.
- **"Me" vs "Someone else" mode** — keep your own master profile, or make a resume for someone else without touching yours.
- **History** — every generated resume is saved per job, reopenable anytime.
- **Independent fact-check** — a second AI pass checks generated claims against the source profile before export.
- **Editable results** — revise summaries, skills, and bullets or improve one section without regenerating everything.
- **Backup & restore** — export profiles and history to a local JSON file and restore them later.
- **Fast perceived results** — structured text resumes parse locally, and the tailored resume appears before the independent fact-check finishes.
- **Evidence-backed corrections** — unsupported text is corrected automatically when an exact grounded replacement is available, with source evidence shown for review.
- **Word export** — downloads a single-column `.docx` with real Word bullets and hyperlinks for ATS and recruiter workflows.
- **Application tracker** — tracks company, role, status, date, and notes locally in the browser.
- **Quality checks** — flags weak openings, long or repetitive bullets, sparse metrics, long summaries, and keyword-stuffed skills.
- **Model fallback** — automatically retries an alternate Gemini model if the primary model is unavailable.
- **Liquid-glass UI** — frosted panels over switchable nature-photo backgrounds, with an SVG displacement refraction effect.

## Privacy

There is no database. Your profile and history are stored only in your browser. The API key is session-only by default; you can explicitly choose to remember it. On the deployed app, AI requests are relayed by a stateless Vercel function to avoid browser network failures; the function does not store the key or content. Nothing is tracked by this app.

---

## Tech stack

- **React 18** + **Vite 5** — static single-page app, no server
- **Google Gemini** (configurable; defaults to `gemini-3.5-flash`) — vision + text, called directly from the browser
- **html2pdf.js** — client-side PDF generation with clickable links
- Pure inline styles + an SVG `feDisplacementMap` filter for the glass effect

---

## Run locally

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL.

## Get a free Gemini API key

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with a Google account and click **Create API key**
3. Paste it into the key box at the top of the app (stored only in your browser)

The Gemini free tier is generous enough for regular personal use.

---

## How to use

1. **Profile** — fill your details once, or click "Auto-fill from an existing resume" to have AI read your current resume. Hit **Save my profile**.
2. **Job** — paste the job description, or upload a screenshot of it.
3. **Generate** — get the tailored resume, match score, covered/missing keywords, and optional cover letter.
4. **Download** — PDF (with clickable links) or `.tex` for Overleaf.

## Deploy

The app is a static build and deploys free anywhere. On **Vercel**: connect this repo, framework preset **Vite**, build command `npm run build`, output directory `dist`. Every push auto-redeploys.

To use another available Gemini model, copy `.env.example` to `.env.local` and change `VITE_GEMINI_MODEL`.

---

## Notes

- Model names change over time. If generation ever fails with a 404, set `VITE_GEMINI_MODEL` in `.env.local` to a model enabled for your key.
- The AI flags any content it isn't sure is grounded in your profile — always review before sending.

## License

MIT — free to use and modify.
