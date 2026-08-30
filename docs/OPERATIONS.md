# ApplyPilot Operations Guide

## Private access

The API accepts the existing `ADMIN_TOKEN` by default. For browser login without storing that token, create a Cloudflare Zero Trust Access application for both `applypilot.pages.dev` and the Worker URL, then set Worker variables `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. Keep `ALLOW_ADMIN_TOKEN=true` so the encrypted backup workflow can authenticate. Access is optional and the deployment remains usable before it is configured.

## Encrypted backups

The root workflow `.github/workflows/backup.yml` exports the database once per day, encrypts it, and retains the encrypted artifact for 14 days. In a private GitHub repository add Actions secrets `APPLYPILOT_API_TOKEN` and `BACKUP_ENCRYPTION_PASSWORD`. The workflow does not run until the repository is pushed and those secrets exist.

```powershell
openssl enc -d -aes-256-cbc -pbkdf2 -in applypilot-backup.json.enc -out applypilot-backup.json
```

## Health checks

The Health page records every source response, retry count, duration, job count, matching evaluation, and document snapshot. A failed board is retried three times. Source failures remain visible in the notification center and do not stop other sources.

## Daily use (Hyd/Blr private + Freelance)

1. Open `https://applypilot.pages.dev` on desktop or mobile.
2. Review new scored **Jobs** in `Review`, **Internships** in `Early career`, and **Gigs** in `Freelance` (Hyd/Bangalore/Remote India only). Use official portal links for alert-only cards.
3. Approve a suitable job/gig to create its tailored application pack (freelance reuses same truth-grounded tailoring, no salary gate).
4. Download the generated resume if required, then finish the application on the official job site.
5. Select **Mark applied** after the portal confirms the submission.
6. Create a recruiter follow-up only when you have a real recruiter email address.
7. Open **Outreach** and select **Approve & send** when the message is ready.

## What the counts mean

- **Review**: full-time jobs waiting for a decision or JD import (excludes internship/freelance).
- **Early career**: internship/new-grad/trainee roles (`opportunity_type=internship`, broad `40%+` gate).
- **Freelance**: contract/freelance/hourly/gig roles (`opportunity_type=freelance`, broad gate, budget shown).
- **Pipeline**: applications you have prepared, applied to, or moved through later stages (all types).
- **Outreach**: recruiter-email drafts, sent messages, and detected replies.
- **Follow-ups ready**: saved drafts that require explicit approval before Gmail can send them.

## Job sources

The scheduled scan (`wrangler.toml:34` every `5` minutes via `applypilot-tasks` Queue) uses configured public company career boards supported by Greenhouse, Lever, Ashby, and SmartRecruiters, plus Workable/Recruitee and Official career-page JSON-LD. Gmail imports official job links from selected job-alert messages. **Freelance** is derived from ATS titles/descriptions matching `freelance|contract|gig|hourly|upwork|fiverr` and uses `freelance_titles` (`migrations/0019_freelance.sql`) with no `minimum_salary` gate.

LinkedIn and Naukri can be used as official destinations and alert sources. Their protected applicant flows are not scraped or auto-submitted.

## Recommended job-search routine

- Keep the **five-minute** scan enabled while actively applying.
- Review newly scored roles promptly, especially fresh postings.
- Use the tailored resume only for the application associated with that job.
- Record the portal confirmation after submitting, so follow-ups stay accurate.
- Review email drafts before pressing **Approve & send**.

## Troubleshooting

- **No direct matches**: add or correct public ATS company sources and review your search preferences.
- **Portal card has no score**: open the official posting and import the complete JD where supported.
- **Email cannot send**: reconnect Gmail OAuth, check the recruiter email, and ensure Worker secrets are configured.
- **Changes do not appear**: refresh the PWA once to update its service-worker cache (`sw.js` is `applypilot-v52`, assets `?v=52` `public/` synced from root).

## Opencode model routing

`opencode.json:1` auto-routes: `build->opencode/nemotron-3-ultra-free`, `plan->opencode/muse-spark-1.2-contributor-free`, `explore->opencode/mimo-v2.5-free`, `general->nemotron-3-ultra`. Restart opencode after editing config. Verify with `npx opencode debug config` and `npx opencode debug agent build` (should show `nemotron-3-ultra-free`). The TUI header still says Muse Spark until you switch to `build` mode (press `Tab` or `/agent build`).
