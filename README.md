# ApplyPilot

ApplyPilot is a mobile-first and desktop job-search command center. The current build contains a working PWA, a Cloudflare Worker API, a D1 database schema, public Greenhouse and Lever discovery adapters, deterministic job matching, optional Gemini drafting, application tracking, recruiter outreach approval, Gmail sending, cron scans, and an audit log.

The browser UI falls back to sample data when the Worker is not running. It never sends email or submits an application in demo mode.

## What works

- Responsive desktop dashboard and installable mobile PWA
- Public Greenhouse and Lever job discovery for configured companies
- Deduplication and preference-based matching
- Explicit shortlist, skip, and approve decisions
- Application record and truthful cover-letter draft generation
- Job-specific ATS resume generation from a verified master profile
- Independent claim audit, grounded correction, keyword coverage, and versioned application packs
- Application-pack review with JSON and LaTeX exports
- Pipeline stages and activity history
- Recruiter outreach drafts and Gmail API sending after an explicit send action
- Gmail recruiter-reply detection that stops scheduled follow-ups
- Optional Telegram notifications for new matches and recruiter replies
- Ten-minute job scans, immediate match emails, and scheduled follow-up checks
- Local demo fallback with persistent browser state

## Deliberate boundaries

- LinkedIn scraping and automated LinkedIn actions are not included.
- Greenhouse and Lever public APIs provide job discovery, but applicant-side submission APIs are not generally available. The app retains the official application URL.
- CAPTCHA, legal declarations, demographic questions, and unsupported forms require a handoff to the user.
- Recruiter addresses must be publicly provided or entered by the user. The system does not guess email addresses.
- The cron follow-up task identifies approved messages that are due. It does not send unapproved messages.

## Local frontend

Run a static server from the project directory:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173`.

## Local Worker

1. Copy `.dev.vars.example` to `.dev.vars` and set a long random `ADMIN_TOKEN`.
2. Install dependencies with `npm.cmd install` on Windows.
3. Create the local database and start the Worker:

```powershell
npm.cmd run db:local
npm.cmd run dev
```

The frontend detects the local API at `http://127.0.0.1:8787/api`. Enter the same admin token under Preferences.

## Cloudflare deployment

1. Create a free Cloudflare account and authenticate Wrangler.
2. Create the D1 database:

```powershell
npx.cmd wrangler d1 create applypilot
```

3. Put the returned `database_id` in `wrangler.toml`.
4. Set `APP_ORIGIN` to the final Pages URL and change `DEMO_MODE` to `false`.
5. Apply migrations and configure secrets:

```powershell
npm.cmd run db:remote
npx.cmd wrangler secret put ADMIN_TOKEN
npx.cmd wrangler secret put GEMINI_API_KEY
npx.cmd wrangler secret put GOOGLE_CLIENT_ID
npx.cmd wrangler secret put GOOGLE_CLIENT_SECRET
npx.cmd wrangler secret put GMAIL_REFRESH_TOKEN
npx.cmd wrangler secret put TELEGRAM_BOT_TOKEN
npx.cmd wrangler secret put TELEGRAM_CHAT_ID
```

6. Deploy the Worker with `npm.cmd run deploy` and deploy the repository root as a Cloudflare Pages static site.

For a same-origin production setup, route `/api/*` to the Worker. If Pages and the Worker use separate origins, change `API_BASE` in `app.js` to the Worker URL and keep `APP_ORIGIN` restricted to the Pages origin.

## AI behavior

Gemini is optional. Without `GEMINI_API_KEY`, the backend produces a conservative template and labels it for review. With Gemini configured, only the role, configured skills, company, and job description are sent. Personal contact information is not included in the prompt. The deployed model is `gemini-3.5-flash`.

Resume tailoring uses the verified master resume profile and complete job description after a user approves a scored job. This sends the stored resume evidence to Gemini, generates a one-page structured resume, runs a second fact-check pass, applies exact grounded corrections, and stores the immutable result with the application. Restricted portal submission still requires the user to complete login, CAPTCHA, and legal declarations.

## Gmail behavior

Gmail requires OAuth credentials and a refresh token with the minimum necessary sending scope. Secrets stay in Worker secret storage. The browser never receives Google credentials. A missing recruiter address or missing OAuth configuration causes the send operation to fail closed.

## Tests

```powershell
npm.cmd test
```
