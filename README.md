This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

Gmail sending uses **Google OAuth + Gmail API**. Follow [Gmail setup and deployment](docs/GMAIL_OAUTH.md) for Google Cloud configuration, environment variables, database migration, production checks, and the optional SMTP fallback. Other email providers are shown as coming soon.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## Scheduled email delivery

`npm run dev` runs the Next.js website only. Automatic delivery runs in the separate
Cloudflare Worker, even when the website is being used at localhost. Both runtimes
must use the same `DATABASE_URL`, `SMTP_ENCRYPTION_KEY`, and B2 configuration.

- `npm run build:worker`: bundle and validate the Worker without deploying.
- `npm run stage:worker`: deploy code and the required secrets, without a Cron trigger
  or queue consumer. Use this to check deployment before releasing overdue emails.
- `npm run deploy:worker`: deploy and activate the every-minute Cron trigger and
  email queue consumer. **This can immediately send existing overdue active campaigns.**
- `npx wrangler tail mail-automation`: inspect Worker execution logs.

Deployment loads the project environment using the same `.env` conventions as Next.js.
Only the required runtime secrets, including the Google OAuth client ID and secret, are uploaded. The Cloudflare API token is
used by the deployment CLI and is never uploaded as a runtime secret. The configured
`email-queue` must exist in the Cloudflare account. Create it once with
`npx wrangler queues create email-queue` if necessary.

A successful `/health` response confirms the Worker is deployed; it does not by
itself prove that Cron, the queue consumer, or delivery is working. Confirm the
Cron and consumer configuration, then follow an authorized test email through
Scheduled, Queued, Sending, and Sent. Cron checks due work each minute, so delivery
is not guaranteed at the exact second selected. Cloudflare trigger changes may
take time to propagate.

Campaign input is interpreted in the selected IANA timezone and converted to UTC
once. `campaigns.start_at` and `email_jobs.scheduled_at` are UTC instants. The scheduler
must not apply the timezone offset again. Nonexistent or repeated daylight-saving
start times are rejected so the user can choose an unambiguous time.

The Emails page shows scheduled time (including timezone), creation time, sent time,
and retry/error information. Campaigns show their schedule and offer View details
for recipient delivery progress. Both pages refresh every 15 seconds.

If a queue publish fails, jobs still in Queued after ten minutes become eligible
for re-enqueue. The consumer atomically claims Queued jobs to prevent two deliveries
from duplicate messages. Jobs whose delivery outcome is unknown are never retried
automatically.
