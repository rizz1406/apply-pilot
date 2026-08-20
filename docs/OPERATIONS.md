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

## Daily use

1. Open `https://applypilot.pages.dev` on desktop or mobile.
2. Review new scored jobs. Use official portal links for alert-only cards.
3. Approve a suitable job to create its tailored application pack.
4. Download the generated resume if required, then finish the application on the official job site.
5. Select **Mark applied** after the portal confirms the submission.
6. Create a recruiter follow-up only when you have a real recruiter email address.
7. Open **Outreach** and select **Approve & send** when the message is ready.

## What the counts mean

- **Review**: jobs waiting for a decision or JD import.
- **Pipeline**: applications you have prepared, applied to, or moved through later stages.
- **Outreach**: recruiter-email drafts, sent messages, and detected replies.
- **Follow-ups ready**: saved drafts that require explicit approval before Gmail can send them.

## Job sources

The scheduled scan uses configured public company career boards supported by Greenhouse, Lever, Ashby, and SmartRecruiters. Gmail imports official job links from selected job-alert messages.

LinkedIn and Naukri can be used as official destinations and alert sources. Their protected applicant flows are not scraped or auto-submitted.

## Recommended job-search routine

- Keep the ten-minute scan enabled while actively applying.
- Review newly scored roles promptly, especially fresh postings.
- Use the tailored resume only for the application associated with that job.
- Record the portal confirmation after submitting, so follow-ups stay accurate.
- Review email drafts before pressing **Approve & send**.

## Troubleshooting

- **No direct matches**: add or correct public ATS company sources and review your search preferences.
- **Portal card has no score**: open the official posting and import the complete JD where supported.
- **Email cannot send**: reconnect Gmail OAuth, check the recruiter email, and ensure Worker secrets are configured.
- **Changes do not appear**: refresh the PWA once to update its service-worker cache.
