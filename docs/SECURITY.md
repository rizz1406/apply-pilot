# Security and Privacy

## Secrets

Never commit `.dev.vars`, Cloudflare API tokens, Google OAuth credentials, Gmail refresh tokens, or personal exports. The root `.gitignore` excludes the local Worker variables and `data/private/` directory.

Store production credentials using Cloudflare Worker secrets:

```powershell
npx.cmd wrangler secret put ADMIN_TOKEN
npx.cmd wrangler secret put GEMINI_API_KEY
npx.cmd wrangler secret put GOOGLE_CLIENT_ID
npx.cmd wrangler secret put GOOGLE_CLIENT_SECRET
npx.cmd wrangler secret put GMAIL_REFRESH_TOKEN
```

Telegram credentials are optional and should be stored as Worker secrets as well.

Cloudflare Access can replace browser-held API tokens. Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` only after the Access application is active; otherwise the API deliberately continues using `ADMIN_TOKEN`.

Backups are encrypted before GitHub receives the artifact. Never commit the encryption password, API token, decrypted export, or generated backup file.

## Personal data

- Candidate, application, and outreach records are stored in the configured Cloudflare D1 database.
- The browser does not receive Google OAuth secrets or refresh tokens.
- Gemini is optional. When it is enabled for resume tailoring, the verified resume evidence and the approved job description are sent to the configured model provider. Do not enable it unless you accept that data handling.
- Do not enter a recruiter address unless it is legitimately provided by the recruiter or employer.

## Sending safeguards

- Outreach is created as a draft.
- Sending requires an explicit user action in the UI.
- Missing Gmail configuration or invalid recruiter email fails closed.
- Gmail reply detection stops future follow-up scheduling for that thread.

## Repository visibility

Use a **private GitHub repository**. The repository contains code and migration schemas, but it must not contain production secrets, Gmail exports, or private candidate data.
