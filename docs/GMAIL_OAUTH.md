# Gmail sending and deployment

Gmail uses Google OAuth 2.0 and the Gmail REST API by default. Neon Auth remains responsible for signing in to this application; a Neon Google login does not grant mailbox sending permission. SMTP App Passwords are an explicit advanced fallback for Gmail. Microsoft, Yahoo and custom SMTP are disabled in both the API and provider selector.

## Configuration

Create a Google Cloud project, enable the Gmail API, configure the OAuth consent screen, and create a **Web application** OAuth client. Configure these server-side values in `.env.local` for local use and in Vercel for deployment:

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id
GOOGLE_CLIENT_SECRET=your-web-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/email-accounts/callback/gmail
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Register the exact `GOOGLE_REDIRECT_URI` in Google's authorized redirect URIs. For deployment, replace both localhost origins with the actual HTTPS app origin. Register each environment separately. The callback origin must match the app origin; do not use a preview deployment with production callback settings.

The Cloudflare Worker needs the same `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, and `SMTP_ENCRYPTION_KEY` as the application, plus its existing B2 settings. `npm run deploy:worker` uploads these runtime secrets. The Google client secret is never a `NEXT_PUBLIC_` value. Keep the existing 64-character encryption key; changing it without re-encrypting stored credentials will break existing accounts.

Requested scopes are `openid`, `email`, and `https://www.googleapis.com/auth/gmail.send`. Identity scopes provide the verified account address and Google account ID without reading the mailbox. `gmail.send` is a sensitive scope; plan for Google's public-app OAuth verification. While an external app is in Testing mode, add explicit test users; refresh tokens with Gmail access generally expire after seven days. Google Workspace administrators may also restrict access.

## Database and rollout

1. Configure the environment and back up the database according to your normal deployment process.
2. Run `npx prisma migrate deploy` and `npx prisma generate` before starting the updated application/worker.
3. Run `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run build:worker`.
4. Run `npm run check:local-production` locally, or `npm run check:production` with production settings. These check configuration and live B2 read/write/delete access, not Google verification or permission grants.
5. Run `npm run start` to test the production app locally. Connect Gmail through its account chooser and consent screen. Verify the connected address, test authorization, then use an explicitly authorized test campaign to check sending with an attachment. Check the same flow through the deployed queue worker. A successful build is not evidence of a live authorized send.
6. Deploy Vercel and stage/release the Worker. Activating the worker can send overdue active campaigns; use `npm run stage:worker` if you need code deployed without active Cron/queue consumption.

The additive migration `20260906_gmail_oauth` preserves SMTP credentials, account IDs, campaigns, and job history. To migrate an SMTP account, choose Connect Gmail and authorize the same address; the existing account is updated through its unique owner/provider/address key. OAuth Reconnect explicitly checks the Google account ID, preventing existing campaigns from silently changing sender.

## Security and delivery behavior

- Connection initiation is an authenticated POST protected by the application's same-origin and rate-limit checks. The callback requires the same signed-in user, matching HttpOnly SameSite cookie, ten-minute state record, and PKCE verifier. State is hashed, the verifier is encrypted, and the record is atomically consumed before exchanging the code.
- Tokens are exchanged and stored only on the server, encrypted with AES-GCM. Token responses and authorization codes are not logged or returned to the browser. Granted scopes and account identity are verified before saving a connection.
- Expiring access tokens refresh in the worker. Conditional updates prevent stale refreshes overwriting a reconnect/disconnect. Revoked grants stop sending and require reconnection. Temporary errors use the existing bounded retry policy.
- A timeout after a Gmail send request is submitted is `DELIVERY_UNKNOWN`: keep its quota reservation for admin review and never automatically resend. Gmail acceptance means accepted for delivery, not confirmed inbox delivery.
- Disconnect removes stored tokens and deactivates sending before attempting Google revocation. If Google cannot be reached, the UI tells the user to remove access in Google Account settings. An already in-flight send may finish. Revoking a Google grant can affect other connections using that same Google account and OAuth client.
- Test verifies Google authorization without sending mail or requesting mailbox-read scopes. A real send is still needed to check Gmail service access and delivery.

## Real localhost production checks

`npm run build` followed by `npm run start` serves the production app at localhost:3000 using real `.env` values. `npm run dev` is the development server. Keep the Google redirect URI at `http://localhost:3000/api/email-accounts/callback/gmail` when testing that origin.

Run `npm run test:gmail:live -- --account you@gmail.com` after connecting the same Gmail address through Email Accounts. This opt-in test loads the real environment, verifies encrypted credentials in the database, refreshes the token through Google, and verifies identity and sending scope. It does not send an email. Ordinary unit tests remain isolated with mocks.

Campaign sending still runs in the separately deployed Cloudflare Worker, even when the UI is localhost. Updating `.env` or rebuilding Next.js does **not** update that worker. Run `npm run deploy:worker` to deploy the updated worker and its Google client ID/secret. This activates Cron and can process pending campaigns. The worker health response must include `emailTransports: ["gmail_api", "gmail_smtp"]`; an older response indicates a stale deployment. A `Password rejected ... gsmtp` error on an OAuth account is a strong indication that an old worker is treating its OAuth token as an SMTP password.

## Provider extensions

`lib/email/providers/registry.ts` defines public provider availability and capabilities. `factory.ts` selects the implementation and authentication method. `types.ts` defines shared sending contracts. The shared MIME builder supports attachments; the scheduler and campaign records stay independent of the transport.

Implement future adapters in `providers/microsoft`, `providers/yahoo`, or `providers/custom-smtp`, and add their account configuration, authorization/token lifecycle, API validation and tests before enabling them in the registry. Custom SMTP will need persistent host/port/TLS settings and outbound network restrictions. The placeholder folders document these requirements and do not claim working integrations.

Official references: [OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [sending MIME messages](https://developers.google.com/workspace/gmail/api/guides/sending), [Gmail API errors](https://developers.google.com/workspace/gmail/api/guides/handle-errors).
