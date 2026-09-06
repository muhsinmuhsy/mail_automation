  # Mail Automation — Production Implementation Plan

  ## Gmail OAuth implementation (2026-09-06)

  **Current sending architecture:** Gmail OAuth 2.0 + Gmail API is the primary flow.
  The authoritative setup, migration, token lifecycle, provider extension, and deployment
  instructions are in [docs/GMAIL_OAUTH.md](docs/GMAIL_OAUTH.md). The older SMTP-specific
  examples below describe the retained advanced fallback, not the default connection UX.

  - Connect Gmail -> Google consent -> encrypted access/refresh tokens -> Queue Worker -> Gmail API.
  - Request `gmail.send` plus `openid email` to identify the connected account; no inbox-read scope.
  - Neon Auth still owns application sign-in. The historical prohibition on custom login
    OAuth exchange below applies to application authentication, not mailbox authorization.
  - `EmailOAuthAttempt` stores short-lived single-use state with an encrypted PKCE verifier.
  - `EmailAccount` stores provider account ID, granted scopes, encrypted tokens, expiry,
    and reconnect/disconnected status. Existing SMTP accounts remain compatible.
  - The provider registry and selector enable Gmail only. Microsoft, Yahoo, and custom SMTP
    have reserved implementation directories and disabled Coming soon cards.
  - Google client ID and client secret are required in both runtimes; the registered callback
    URL is required in the Next.js app. See `.env.example`.

  ## What We Already Proved (SMTP fallback POC)

  - Cloudflare Workers can send Gmail SMTP emails
  - Port 587 STARTTLS validated as primary production path
  - AUTH LOGIN succeeds with base64 username/password
  - MIME `multipart/mixed` with PDF attachment works
  - Cloudflare Queue sends and consumer receives
  - Cloudflare Cron triggers Worker → Queue → Consumer → Gmail

  **Project root:** `D:\cour\mail-automation`

  ---

  ## Final Architecture

  **Architecture change:** We are changing into a zero-cost-friendly split
  deployment:

  - Vercel hosts the Next.js web app, dashboard, auth pages, and user/admin API
    routes.
  - Cloudflare Free runs a tiny background Worker only for `scheduled()` Cron
    and `queue()` consumer automation.
  - Neon PostgreSQL remains the shared source of truth between Vercel and the
    Cloudflare Worker.
  - Backblaze B2 remains the private resume PDF storage provider.
  - Gmail OAuth + Gmail API is the primary email provider; SMTP is an optional fallback.

  New flow:

  ```text
  User opens app
    -> Vercel serves Next.js pages and API routes
    -> User creates campaign
    -> Vercel API writes campaigns and email_jobs to Neon DB
    -> Cloudflare Cron runs every minute
    -> Tiny Cloudflare Worker claims due email_jobs from Neon DB
    -> Worker pushes claimed job IDs to Cloudflare Queue
    -> Cloudflare Queue delivers messages to the Worker consumer
    -> Worker consumer loads job/account/template/resume data
    -> Worker downloads resume from Backblaze B2 when needed
    -> Worker refreshes OAuth credentials and sends through Gmail API
    -> Worker updates email_jobs/email_logs/usage tables in Neon DB
    -> Vercel dashboard reads Neon DB and shows current status
  ```

  This replaces the previous single-Cloudflare-Worker deployment for the full
  Next.js application. The product behavior remains the same, but the runtime
  boundary changes so the Cloudflare Worker can stay under the Free-plan Worker
  size limit.
   **Runtime boundary:** Vercel is the public web/API runtime. Cloudflare is only the background automation runtime for Cron and Queue.

   **Storage abstraction:** The application never talks to Backblaze B2
   directly. It depends on a `StorageService` interface; `B2StorageService`
   is the current implementation backed by Backblaze's S3-Compatible API.

   ```
                         APPLICATION
                              │
                              ▼
                    ┌──────────────────┐
                    │ Storage Service  │
                    │    Interface     │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Backblaze B2     │
                    │ S3-Compatible API│
                    └────────┬─────────┘
                             │
                             ▼
                       Resume PDFs
   ```

   **Note:** Split deployment. Vercel serves the Next.js app/API, while one small Cloudflare Worker handles `scheduled()` and `queue()` for background email automation. The email sending layer is provider-neutral; Gmail is the only implemented provider for MVP. The file storage layer is also provider-neutral through a `StorageService` interface; Backblaze B2 (S3-Compatible API) is the only implemented storage provider for MVP.

  ---

  ## Tech Stack

  | Layer | Technology |
  |-------|-----------|
  | Frontend | Next.js + TypeScript + Tailwind CSS |
  | Next.js Runtime | Vercel Hobby deployment |
   | Database | Neon PostgreSQL |
   | Auth | Neon Auth |
   | File Storage | Backblaze B2 Cloud Storage (S3-Compatible API) |
   | Queue | Cloudflare Queues via tiny background Worker |
   | Scheduler | Cloudflare Cron via tiny background Worker |
   | Email | Gmail API with Google OAuth; optional SMTP fallback on port 587 |

   ### Storage Provider Decision

   The original architecture selected Cloudflare R2 for file storage.

   Before implementation/deployment, the storage provider was changed
   from Cloudflare R2 to Backblaze B2 Cloud Storage.

   Current implementation:
   - Backblaze B2 Cloud Storage
   - S3-Compatible API
   - AWS SDK for JavaScript v3
   - Private bucket
   - Server-side access only
   - Storage access isolated behind an application storage interface

   Cloudflare R2 is no longer used for application file storage.

   The application must not depend directly on Backblaze-specific APIs
   outside the storage adapter.

   ---

  ## Authentication

  Use the current Neon Auth SDK and its built-in email-verification flow. Do not implement custom verification tokens, verification tables, password hashing, custom auth endpoints, custom verification email delivery, or custom OAuth token exchange.

  **Important:** Neon Auth's Google button signs the user into the application. The Email Accounts Google button separately authorizes Gmail sending. The application receives mailbox OAuth tokens only from the latter flow. App Passwords are an explicit advanced fallback.

  **Neon Auth responsibilities:**
  - Registration
  - Email verification
  - Resend verification
  - Login
  - Logout
  - Forgot password
  - Password reset
  - Session management
  - Google OAuth sign-in

  **Application responsibilities:**
  - Protected routes and API endpoints
  - Verified email check before allowing sensitive actions
  - User profile data in `users` table

  ### Sign-in Methods

  Neon Auth supports:

  - Email + password
  - Continue with Google

  Google OAuth is handled entirely by Neon Auth. Do not implement custom Google OAuth token exchange, Google user storage, or custom OAuth sessions.

  The application receives the authenticated Neon Auth session and uses the Neon Auth user ID for all application data ownership checks.

  ### Auth Pages

  ```
  /register
  /login
  /verify-email
  /forgot-password
  /dashboard
  ```

  ### Auth Flow — Email/Password

  ```
  User visits /register
      |
      v
  Enter name, email, password
      |
      v
  Neon Auth creates account
      |
      v
  Neon Auth sends verification email
      |
      v
  User clicks verification link
      |
      v
  Email verified
      |
      v
  User can log in
      |
      v
  Neon Auth session
      |
      v
  Dashboard
  ```

  ### Auth Flow — Google OAuth

  ```
  User visits /login
      |
      v
  [ Continue with Google ]
      |
      v
  Google authentication
      |
      v
  Neon Auth creates/signs in user
      |
      v
  Neon Auth session
      |
      v
  Dashboard
  ```

  ### Login UI

  ```
  ┌─────────────────────────────┐
  │        Welcome back         │
  │                             │
  │ [ Continue with Google ]    │
  │                             │
  │ ───────── OR ─────────      │
  │                             │
  │ Email                       │
  │ Password                    │
  │                             │
  │ [ Sign in ]                 │
  └─────────────────────────────┘
  ```

  ### Registration UI

  ```
  ┌─────────────────────────────┐
  │     Create your account     │
  │                             │
  │ [ Continue with Google ]    │
  │                             │
  │ ───────── OR ─────────      │
  │                             │
  │ Name                        │
  │ Email                       │
  │ Password                    │
  │                             │
  │ [ Create account ]          │
  └─────────────────────────────┘
  ```

  ### Unverified User Behavior

  Unverified users must not get full application access:

  ```
  Email verified?
        │
    ┌───┴───┐
    │       │
    YES      NO
    │       │
    ▼       ▼
  Allow    Show "Please verify your email"
  full      with Resend verification option
  access    Block: connect email account, upload resume,
            create campaign, send emails
  ```

  ### Security Rule

  **Never allow unverified users to:**
  - Connect email accounts
  - Upload resumes
  - Create campaigns
  - Send emails
  - Access protected dashboard features

  Verify the user's verified status from the Neon Auth session on every protected operation. Do not trust browser-supplied fields like `emailVerified`.

  ### Neon Auth Setup

  Use the current Neon Auth Next.js SDK:

  ```ts
  import { createNeonAuth } from '@neondatabase/auth/next/server'
  ```

  Required environment variables:
  - `NEON_AUTH_BASE_URL`
  - `NEON_AUTH_COOKIE_SECRET` (minimum 32 characters)

  The application uses:
  - `auth.handler()`
  - `auth.middleware()`
  - `auth.getSession()`

  **Important:** Any Next.js Server Component or Route Handler that calls Neon Auth server methods must follow the current Neon Auth SDK rendering requirements, including dynamic rendering where required.

  **Auth emails:** Verify Neon Auth email delivery configuration before production launch. Neon Auth may use a shared email service for development and require explicit provider configuration for production. The Gmail SMTP account used for campaign emails is separate from Neon Auth's transactional/auth email delivery — they are independent systems.

  ### Database Relationship

  ```
  neon_auth.user
          │
          │ same authenticated user ID
          ▼
  public.users
          │
          ├── email_accounts
          ├── resumes
          ├── contacts
          ├── templates
          ├── campaigns
          └── email_jobs
  ```

  Do not duplicate passwords, verification fields, sessions, or auth tokens in `public.users`. The `users.id` is the Neon Auth user ID.

  ### User Profile Provisioning

  After successful email/password registration or Google OAuth sign-in, ensure a corresponding `public.users` row exists using the Neon Auth user ID.

  - Use an idempotent upsert/create-if-missing operation.
  - Never create a separate authentication user in `public.users`.
  - The application profile row must be created automatically; do not rely on the user to complete a separate profile setup step.

  This is especially important for Google OAuth, where there is no separate application registration form.

  ### Google OAuth Configuration

  Enable Google as an OAuth provider in Neon Auth.

  - Use Neon Auth's provider configuration to enable Google OAuth.
  - Prefer Neon-managed/shared OAuth credentials when available.
  - If custom credentials are required, configure them through Neon Auth's provider configuration.
  - Do not implement Google OAuth token exchange, Google user storage, or custom OAuth sessions in the application.
  - Do not store Google OAuth client secrets in application database tables.

  Neon Auth handles the complete Google OAuth flow. The application only receives the authenticated Neon Auth session.

  ---

  ## Environment Variables

  ### Application `.env`

  ```env
  # Neon Auth
  NEON_AUTH_BASE_URL=
  NEON_AUTH_COOKIE_SECRET=

   # Database
   DATABASE_URL=

   # Backblaze B2
   B2_BUCKET_NAME=
   B2_REGION=
   B2_ENDPOINT=
   B2_KEY_ID=
   B2_APPLICATION_KEY=

   # Application
   NEXT_PUBLIC_APP_URL=
   ```

   Meaning:
   - `B2_BUCKET_NAME` → Your bucket name
   - `B2_REGION` → Region of that bucket (e.g. `us-west-004`)
   - `B2_ENDPOINT` → The exact Endpoint shown in the B2 bucket details
   - `B2_KEY_ID` → Backblaze application key ID
   - `B2_APPLICATION_KEY` → Backblaze application key secret

   Create the bucket in the B2 console and copy the **Endpoint** shown in
   the bucket details, then use that exact endpoint and the bucket's
   matching region. Do not hand-construct the endpoint format; use the
   value Backblaze provides for the bucket.

   Backblaze officially maps the B2 `keyID` to the S3 `AWS_ACCESS_KEY_ID`
   and `applicationKey` to the S3 `AWS_SECRET_ACCESS_KEY`.

   ### Backblaze B2 Access

   B2 is an external S3-compatible service, not a Cloudflare binding. Its
   credentials/configuration belong in Worker secrets/environment
   configuration, and the B2 adapter creates the S3 client using the B2
   endpoint. The `wrangler.toml` must NOT contain an `[[r2_buckets]]`
   block — that configuration is specifically for Cloudflare R2 and is no
   longer used.

   ```toml
   # wrangler.toml
   # No [[r2_buckets]] block. B2 is configured via Worker secrets:
   # B2_BUCKET_NAME, B2_REGION, B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY
   ```

   The B2 storage adapter builds an AWS SDK `S3Client` with:
   - `endpoint` = `B2_ENDPOINT`
   - `region` = `B2_REGION`
   - `credentials.accessKeyId` = `B2_KEY_ID`
   - `credentials.secretAccessKey` = `B2_APPLICATION_KEY`

   Do not expose B2 credentials to client code.

  ### Worker `.dev.vars` / Secrets

  ```env
  # SMTP credentials are stored encrypted in the database.
  # The application-level encryption key must be provided here.
  SMTP_ENCRYPTION_KEY=
  ```

  **Rules:**
  - `.env` is for local development only. Do not commit it.
  - `.dev.vars` is for local Worker secrets. Do not commit it.
  - Production secrets must be set via `wrangler secret put`.
  - `NEON_AUTH_COOKIE_SECRET` must be at least 32 characters.
  - `SMTP_ENCRYPTION_KEY` must be stored separately from the database and never committed.

   ---

   ## File Storage — Backblaze B2 (S3-Compatible API)

   Resume PDFs are stored in Backblaze B2 Cloud Storage using the
   S3-Compatible API. The application must depend only on a storage
   abstraction, never on Backblaze-specific APIs outside the B2 adapter.

   ### Storage Abstraction

   The application depends on a `StorageService` interface, not on
   `B2StorageService` directly.

   ```
   Application
        ↓
   StorageService
        ↓
   B2StorageService
        ↓
   Backblaze B2
   ```

   ```ts
   // lib/storage/storage.types.ts
   interface UploadInput {
     key: string;
     body: ReadableStream | Buffer | Uint8Array;
     contentType: string;
     contentLength?: number;
     metadata?: Record<string, string>;
   }

   interface StoredObject {
     key: string;
     size: number;
     contentType: string;
     metadata: ObjectMetadata;
   }

   interface ObjectMetadata {
     key: string;
     sizeBytes: number;
     contentType: string;
     eTag?: string;
     uploadedAt?: string;
   }

   interface StorageService {
     upload(input: UploadInput): Promise<StoredObject>;
     download(key: string): Promise<ReadableStream>;
     delete(key: string): Promise<void>;
     exists(key: string): Promise<boolean>;
     getMetadata(key: string): Promise<ObjectMetadata>;
   }
   ```

   `lib/storage/storage.factory.ts` resolves the configured implementation:

   ```ts
   // lib/storage/storage.factory.ts
   export function createStorageService(env: StorageEnv): StorageService {
     // Currently: Backblaze B2. Swap implementations without touching callers.
     return new B2StorageService(b2ClientFromEnv(env));
   }
   ```

   The B2 implementation lives behind `lib/storage/b2/`:
   - `b2.client.ts` builds the AWS SDK `S3Client`
   - `b2.storage.ts` implements `StorageService` using the S3 client
   - `b2.errors.ts` maps B2/S3 errors to application error types

   ### B2 Implementation (S3-Compatible API)

   Use Backblaze's S3-Compatible API, not the B2 Native API. Backblaze
   explicitly recommends the S3-compatible API for most new integrations
   and supports the AWS SDK for JavaScript v3.

   Use `@aws-sdk/client-s3`. Backblaze's official JavaScript
   documentation demonstrates `S3Client` with `endpoint`, `region`, and
   `credentials` for B2.

   ```ts
   // lib/storage/b2/b2.client.ts (conceptual)
   import { S3Client } from "@aws-sdk/client-s3";

   const client = new S3Client({
     endpoint: B2_ENDPOINT,          // exact Endpoint copied from the B2 bucket details
     region: B2_REGION,              // region of that bucket, e.g. us-west-004
     credentials: {
       accessKeyId: B2_KEY_ID,                 // maps to B2 keyID
       secretAccessKey: B2_APPLICATION_KEY,     // maps to B2 applicationKey
     },
     forcePathStyle: false,
   });
   ```

   Backblaze's S3 endpoint follows `https://s3.<region>.backblazeb2.com`
   and uses HTTPS.

   ### Backblaze B2 Security

   B2 credentials are server-side secrets only.

   Never expose to browser/client code:
   - `B2_KEY_ID`
   - `B2_APPLICATION_KEY`
   - `B2_ENDPOINT` credentials
   - any storage credentials

   All B2 operations are performed by the server/Worker storage adapter.
   The B2 bucket is private. The client never receives permanent B2
   credentials. For a resume application this is critical.

   ### Scoped B2 Application Key

   Do not use an unrestricted master credential. Backblaze supports scoped
   application keys restricted to a specific bucket, access type, and even
   a file-name prefix.

   ```
   B2 Application Key
        │
        ▼
   Resume bucket only
        │
        ├── Read
        ├── Write
        └── Delete
   ```

   The key may also be prefix-restricted when appropriate. This is much
   better than account-wide access.

   ### Resume Storage Flow

   ```
   User
    ↓
   Upload Resume
    ↓
   Backend validation
    ├── authentication
    ├── authorization
    ├── MIME validation
    ├── extension validation
    ├── PDF validation
    ├── size limit
    └── quota validation
    ↓
   Generate storage key
    ↓
   StorageService.upload()
    ↓
   B2StorageService
    ↓
   Backblaze B2
    ↓
   Store storage_key in Neon
   ```

   The database stores `storage_key`, not a public URL.

   ### Resume Download Flow (Email Sending)

   ```
   Queue job
    ↓
   Load resume metadata from Neon
    ↓
   storage_key
    ↓
   StorageService.download()
    ↓
   Backblaze B2
    ↓
   PDF bytes
    ↓
   SMTP provider
    ↓
   Email attachment
   ```

   Load the resume from Backblaze B2 through the storage abstraction.

   ### Private Bucket

   The B2 bucket must be PRIVATE. Users must not access resumes directly
   via a public B2 URL. The application authorizes:

   ```
   currentUser.id
        ↓
   resume.user_id
        ↓
   storage_key
        ↓
   B2
   ```

   This matches the existing security rule that users cannot retrieve
   another user's object.

   ### Presigned URLs

   Backblaze's S3-compatible API supports presigned URLs for upload and
   download. For the initial implementation, do NOT make browser-direct
   presigned uploads the default. Keep it simple:

   ```
   Browser
    ↓
   Next.js / Worker
    ↓
   B2
   ```

   Later, if large-file uploads become a performance concern, a
   short-lived presigned URL can be introduced behind the same
   `StorageService`:

   ```
   Browser
    ↓
   short-lived presigned URL
    ↓
   B2
   ```

   That keeps the first implementation simpler and secure.

   ### B2 Lifecycle / Old Versions

   Because B2 buckets are versioned, deleting a resume object must not be
   assumed to immediately remove every stored version.

   Configure an appropriate B2 lifecycle policy to remove old/hidden
   versions after the defined retention period.

   The application must treat a deleted resume as unavailable immediately,
   even if an older B2 version still exists internally.

   ### B2 CORS

   Because uploads/downloads are server-side initially
   (`Browser → Application → B2`), broad public CORS is not required for
   normal resume operations.

   If direct browser uploads/downloads using presigned URLs are
   introduced later, configure B2 S3-compatible CORS for the production
   origin only. Backblaze supports CORS configuration for the
   S3-compatible API.

   ---

   ## Split Vercel + Cloudflare Worker Integration

  Use the zero-cost-friendly split deployment model.

  - Vercel deploys the Next.js app and API routes with `next build`.
  - Cloudflare deploys only `worker/index.ts` with Wrangler.
  - The Cloudflare Worker must not import the generated Next.js app bundle.
  - The Worker exposes only background automation handlers plus a minimal
    health/info `fetch()` response.

   Wrangler uses:
   ```toml
   main = "worker/index.ts"
   compatibility_date = "2026-08-22"
   # nodejs_compat is enabled by default for compatibility_date >= 2026-08-04,
   # so the flag is not strictly required, but it is safe to keep explicit.
   compatibility_flags = ["nodejs_compat"]
   ```

  `worker/index.ts` exposes the background handlers:

  ```ts
  // worker/index.ts
  export default {
    fetch(request: Request) {
      // Minimal health/info endpoint only. Next.js is served by Vercel.
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
      // Cron handler: enqueue due email jobs
    },

    async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
      // Queue consumer: send emails
    }
  };
  ```

  Do not run the full Next.js application inside the Cloudflare Worker. Keeping
  the Worker small is required for the Cloudflare Free-plan Worker size limit.

  ---

  ## Project Structure

  ```
  mail-automation/
  ├── app/
  │   ├── (auth)/
  │   │   ├── login/
  │   │   ├── register/
  │   │   ├── verify-email/
  │   │   └── forgot-password/
  │   ├── (dashboard)/
  │   │   ├── dashboard/
  │   │   ├── email-accounts/
  │   │   ├── resumes/
  │   │   ├── contacts/
  │   │   ├── templates/
  │   │   ├── campaigns/
  │   │   └── emails/
  │   ├── admin/
  │   │   ├── page.tsx
  │   │   ├── users/
  │   │   ├── emails/
  │   │   ├── campaigns/
  │   │   └── settings/
  │   └── api/
  │       ├── email-accounts/
  │       ├── resumes/
  │       ├── contacts/
  │       ├── templates/
  │       ├── campaigns/
  │       ├── emails/
  │       └── admin/
  ├── components/
  │   ├── ui/
  │   │   ├── Button.tsx
  │   │   ├── Input.tsx
  │   │   ├── Select.tsx
  │   │   ├── Textarea.tsx
  │   │   ├── Dialog.tsx
  │   │   ├── Dropdown.tsx
  │   │   ├── DataTable.tsx
  │   │   ├── Pagination.tsx
  │   │   ├── SearchInput.tsx
  │   │   ├── Badge.tsx
  │   │   ├── StatusBadge.tsx
  │   │   ├── Toast.tsx
  │   │   ├── ConfirmDialog.tsx
  │   │   ├── EmptyState.tsx
  │   │   ├── LoadingSpinner.tsx
  │   │   ├── ErrorState.tsx
  │   │   ├── FileUpload.tsx
  │   │   └── DateTimePicker.tsx
  │   ├── layout/
  │   ├── email-accounts/
  │   │   ├── EmailAccountList.tsx
  │   │   ├── EmailAccountCard.tsx
  │   │   ├── EmailAccountForm.tsx
  │   │   ├── ProviderSelector.tsx
  │   │   ├── ProviderStatus.tsx
  │   │   └── ProviderConnectionDialog.tsx
  │   ├── resumes/
  │   ├── contacts/
  │   ├── templates/
  │   ├── campaigns/
  │   └── emails/
  │   └── admin/
  │       ├── AdminDashboard.tsx
  │       ├── AdminUserTable.tsx
  │       ├── AdminEmailTable.tsx
  │       ├── AdminCampaignTable.tsx
  │       └── AdminSettingsForm.tsx
  ├── lib/
  │   ├── auth/
  │   ├── db/
  │   │   └── prisma.ts
  │   ├── email/
  │   │   ├── service.ts
  │   │   ├── mime.ts
  │   │   └── providers/
  │   │       ├── types.ts
  │   │       ├── registry.ts
  │   │       ├── factory.ts
  │   │       ├── gmail/
  │   │       ├── microsoft/        # future
  │   │       ├── yahoo/            # future
  │   │       └── custom-smtp/      # future
   │   ├── storage/
   │   │   ├── storage.types.ts
   │   │   ├── storage.service.ts
   │   │   ├── storage.factory.ts
   │   │   └── b2/
   │   │       ├── b2.client.ts
   │   │       ├── b2.storage.ts
   │   │       └── b2.errors.ts
   │   ├── campaigns/
   │   ├── jobs/
   │   ├── limits/
   │   │   └── email-limit-service.ts
   │   ├── security/
   │   └── validation/
  │       ├── common.ts
  │       ├── auth.ts
  │       ├── email-account.ts
  │       ├── resume.ts
  │       ├── contact.ts
  │       ├── template.ts
  │       ├── campaign.ts
  │       └── admin.ts
  ├── worker/
  │   ├── index.ts
  │   ├── scheduler.ts
  │   └── consumer.ts
  ├── prisma/
  │   ├── schema.prisma
  │   └── migrations/
  │       └── 20260824_initial/
  │           └── migration.sql
  ├── prisma.config.ts
  ├── public/
  ├── vercel.json
  ├── wrangler.toml
  ├── package.json
  └── README.md
  ```

   **Note:** Split deployment using Vercel for Next.js and Cloudflare Workers for background automation. The `worker/` directory contains handlers for scheduled jobs and Queue consumption only. The `lib/email/providers/` directory contains a provider-neutral email sending layer; only `gmail/` is implemented for MVP. The `lib/storage/` directory contains a provider-neutral `StorageService` interface; only `b2/` (Backblaze B2 S3-Compatible API) is implemented for MVP. Database access goes through Prisma ORM in `lib/db/prisma.ts`.

  ---

  ## Database Schema

  The Prisma schema is the source of truth for the database design.

  ```prisma
  // prisma/schema.prisma

  generator client {
    provider   = "prisma-client"
    output     = "../lib/generated/prisma"
    engineType = "client"
    runtime    = "cloudflare"
  }

  datasource db {
    provider = "postgresql"
  }

  enum UserRole {
    USER
    ADMIN
  }

  enum EmailProvider {
    gmail
    microsoft
    yahoo
    custom_smtp
  }

  enum AuthMethod {
    app_password
    oauth2
    password
  }

  enum CampaignStatus {
    DRAFT
    ACTIVE
    PAUSED
    COMPLETED
    CANCELLED
  }

  enum EmailJobStatus {
    SCHEDULED
    QUEUED
    PROCESSING
    RETRY_WAIT
    SENT
    FAILED
    CANCELLED
    DELIVERY_UNKNOWN
  }

  enum ReservationStatus {
    RESERVED
    COMMITTED
    RELEASED
    UNKNOWN
  }

  model User {
    id                              UUID    @id @default(dbgenerated("gen_random_uuid()"))
    email                           String  @unique
    name                            String?
    role                            UserRole @default(USER)
    is_active                       Boolean @default(true)
    daily_email_limit_override      Int?
    created_at                      DateTime @default(now()) @db.Timestamptz

    email_accounts EmailAccount[]
    resumes         Resume[]
    contacts        Contact[]
    templates       Template[]
    campaigns       Campaign[]
    email_jobs      EmailJob[]
    email_usage_daily EmailUsageDaily[]
    reservations      EmailSendReservation[]

    @@map("users")
  }

  model EmailAccount {
    id                     UUID    @id @default(dbgenerated("gen_random_uuid()"))
    user_id                UUID    @db.Uuid
    user                   User    @relation(fields: [user_id], references: [id], onDelete: Cascade)
    provider               EmailProvider
    email                  String
    auth_method            AuthMethod
    encrypted_secret       String?
    encrypted_refresh_token String?
    access_token_expires_at DateTime? @db.Timestamptz
    is_active              Boolean @default(true)
    created_at             DateTime @default(now()) @db.Timestamptz
    updated_at             DateTime @updatedAt @default(now()) @db.Timestamptz

    campaigns   Campaign[]
    email_jobs  EmailJob[]

    @@unique([user_id, provider, email])
    @@map("email_accounts")
  }

   model Resume {
     id          UUID      @id @default(dbgenerated("gen_random_uuid()"))
     user_id     UUID      @db.Uuid
     user        User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
     filename    String    @db.VarChar(255)
     storage_key String    @db.VarChar(1024)
     size_bytes  Int?
     is_default  Boolean   @default(false)
     deleted_at  DateTime? @db.Timestamptz
     created_at  DateTime  @default(now()) @db.Timestamptz

    campaigns  Campaign[]
    email_jobs EmailJob[]

    @@index([user_id])
    @@map("resumes")
  }

  model Contact {
    id         UUID    @id @default(dbgenerated("gen_random_uuid()"))
    user_id    UUID    @db.Uuid
    user       User    @relation(fields: [user_id], references: [id], onDelete: Cascade)
    name       String  @db.VarChar(100)
    email      String  @db.VarChar(255)
    company    String? @db.VarChar(200)
    job_title  String? @db.VarChar(200)
    notes      String? @db.Text
    created_at DateTime @default(now()) @db.Timestamptz
    updated_at DateTime @updatedAt @default(now()) @db.Timestamptz

    email_jobs EmailJob[]

    @@index([user_id, email])
    @@map("contacts")
  }

  model Template {
    id         UUID    @id @default(dbgenerated("gen_random_uuid()"))
    user_id    UUID    @db.Uuid
    user       User    @relation(fields: [user_id], references: [id], onDelete: Cascade)
    name       String  @db.VarChar(100)
    subject    String  @db.VarChar(200)
    body       String  @db.Text
    created_at DateTime @default(now()) @db.Timestamptz
    updated_at DateTime @updatedAt @default(now()) @db.Timestamptz

    campaigns  Campaign[]
    email_jobs EmailJob[]

    @@index([user_id])
    @@map("templates")
  }

  model Campaign {
    id                 UUID    @id @default(dbgenerated("gen_random_uuid()"))
    user_id            UUID    @db.Uuid
    user               User    @relation(fields: [user_id], references: [id], onDelete: Cascade)
    email_account_id   UUID    @db.Uuid
    email_account      EmailAccount @relation(fields: [email_account_id], references: [id])
    resume_id          UUID    @db.Uuid
    resume             Resume @relation(fields: [resume_id], references: [id])
    template_id        UUID    @db.Uuid
    template           Template @relation(fields: [template_id], references: [id])
    name               String  @db.VarChar(255)
    start_at           DateTime @db.Timestamptz
    timezone           String  @default("UTC") @db.VarChar(64)
    interval_minutes   Int     @default(5)
    daily_limit        Int?
    status             CampaignStatus @default(DRAFT)
    created_at         DateTime @default(now()) @db.Timestamptz
    updated_at         DateTime @updatedAt @default(now()) @db.Timestamptz

    email_jobs EmailJob[]
    usage_daily CampaignUsageDaily[]

    @@index([user_id, status])
    @@map("campaigns")
  }

  model EmailJob {
    id                      UUID    @id @default(dbgenerated("gen_random_uuid()"))
    user_id                 UUID    @db.Uuid
    user                    User    @relation(fields: [user_id], references: [id], onDelete: Cascade)
    campaign_id             UUID?   @db.Uuid
    campaign                Campaign? @relation(fields: [campaign_id], references: [id])
    contact_id              UUID    @db.Uuid
    contact                 Contact @relation(fields: [contact_id], references: [id])
    email_account_id        UUID    @db.Uuid
    email_account           EmailAccount @relation(fields: [email_account_id], references: [id])
    resume_id               UUID    @db.Uuid
    resume                  Resume @relation(fields: [resume_id], references: [id])
    template_id             UUID    @db.Uuid
    template                Template @relation(fields: [template_id], references: [id])
    to_email                String  @db.VarChar(255)
    subject                 String  @db.VarChar(255)
    body                    String  @db.Text
    scheduled_at            DateTime @db.Timestamptz
    status                  EmailJobStatus @default(SCHEDULED)
    attempt_count           Int     @default(0)
    processing_started_at   DateTime? @db.Timestamptz
    next_attempt_at         DateTime? @db.Timestamptz
    sent_at                 DateTime? @db.Timestamptz
    error_message           String?
    created_at              DateTime @default(now()) @db.Timestamptz
    updated_at              DateTime @updatedAt @default(now()) @db.Timestamptz

    email_logs     EmailLog[]
    reservations    EmailSendReservation[]

    @@index([status, scheduled_at])
    @@index([user_id, status])
    @@index([campaign_id])
    @@index([email_account_id])
    @@index([next_attempt_at])
    @@map("email_jobs")
  }

  model EmailLog {
    id           UUID    @id @default(dbgenerated("gen_random_uuid()"))
    email_job_id UUID    @db.Uuid
    email_job    EmailJob @relation(fields: [email_job_id], references: [id], onDelete: Cascade)
    status       String  @db.VarChar(50)
    smtp_response String?
    error_message String?
    created_at   DateTime @default(now()) @db.Timestamptz

    @@index([email_job_id])
    @@map("email_logs")
  }

  `EmailLog.status` is intentionally free-form. It records provider/
  transport outcomes for audit purposes and is not a workflow state.
  Do not treat it as part of the email job state machine.

  model SystemSetting {
    id                        Int     @id @default(1)
    default_daily_email_limit Int     @default(20)
    global_daily_email_limit  Int     @default(500)
    email_sending_enabled     Boolean @default(true)
    updated_at                DateTime @updatedAt @default(now()) @db.Timestamptz

    @@map("system_settings")
  }

  model EmailUsageDaily {
    user_id       UUID    @db.Uuid
    user          User    @relation(fields: [user_id], references: [id], onDelete: Cascade)
    usage_date    DateTime @db.Date
    sent_count    Int     @default(0)
    reserved_count Int    @default(0)

    @@id([user_id, usage_date])
    @@map("email_usage_daily")
  }

  model CampaignUsageDaily {
    campaign_id   UUID    @db.Uuid
    campaign      Campaign @relation(fields: [campaign_id], references: [id], onDelete: Cascade)
    usage_date    DateTime @db.Date
    sent_count    Int     @default(0)
    reserved_count Int    @default(0)

    @@id([campaign_id, usage_date])
    @@map("campaign_usage_daily")
  }

  model EmailSendReservation {
    id            UUID    @id @default(dbgenerated("gen_random_uuid()"))
    email_job_id  UUID    @db.Uuid
    email_job     EmailJob @relation(fields: [email_job_id], references: [id], onDelete: Cascade)
    attempt_number Int    @default(1)
    user_id       UUID    @db.Uuid
    user          User    @relation(fields: [user_id], references: [id], onDelete: Cascade)
    campaign_id   UUID?   @db.Uuid
    campaign      Campaign? @relation(fields: [campaign_id], references: [id], onDelete: Cascade)
    usage_date    DateTime @db.Date
    status        ReservationStatus @default(RESERVED)
    created_at    DateTime @default(now()) @db.Timestamptz
    resolved_at   DateTime? @db.Timestamptz

    @@unique([email_job_id, attempt_number])
    @@index([email_job_id])
    @@index([user_id, usage_date])
    @@index([campaign_id], map: "idx_email_send_reservations_campaign_id", type: Btree, where: "campaign_id IS NOT NULL")
    @@map("email_send_reservations")
  }

  model SystemUsageDaily {
    usage_date     DateTime @id @db.Date
    sent_count     Int      @default(0)
    reserved_count Int      @default(0)

    @@map("system_usage_daily")
  }
  ```

  The conceptual table design remains exactly the same. Prisma Migrate
  generates the PostgreSQL DDL from this schema and tracks applied
  migrations under `prisma/migrations/`.

  Do not maintain a separate handwritten SQL schema as the primary
  application schema source. Use `prisma/schema.prisma` as the source
  of truth.

  For database CHECK constraints that Prisma Schema Language cannot
  express directly, add them through custom SQL inside version-controlled
  Prisma migrations. Examples:
  - `interval_minutes > 0`
  - `daily_limit IS NULL OR daily_limit > 0`
  - `sent_count >= 0`
  - `reserved_count >= 0`

  Review generated migration SQL and augment it with these checks
  before applying to production.

  ## Prisma ORM + Cloudflare Workers + Neon

  ### ORM

  Use:
  - Prisma ORM
  - Prisma Migrate
  - Neon PostgreSQL

  Prisma is the application database access layer and migration system.

  ### Schema Source of Truth

  The Prisma schema is:

  prisma/schema.prisma

  Prisma configuration:

  prisma.config.ts

  ```ts
  // prisma.config.ts
  import "dotenv/config";
  import { defineConfig, env } from "prisma/config";

  export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
      path: "prisma/migrations",
    },
    datasource: {
      url: env("DATABASE_URL"),
    },
  });
  ```

  Application database models must be defined in Prisma.

  Generated migration SQL remains version-controlled under:

  prisma/migrations/

  ### Cloudflare Compatibility

  The Next.js application runs on Vercel. Background automation runs in a
  small Cloudflare Worker.

  Use Prisma's edge-compatible PostgreSQL configuration for the Worker
  runtime.

  Use the current Prisma PostgreSQL/Neon driver-adapter approach.
  Do not use the traditional Node-only Prisma runtime configuration.

  Use Prisma Client with the edge-compatible configuration documented
  for Cloudflare Workers.

  The Prisma client must not depend on Rust query-engine binaries
  inside the Worker bundle.

  Required dependency:

  @prisma/adapter-neon

  Example `lib/db/prisma.ts`:

  ```ts
  import { PrismaClient } from '../generated/prisma/client';
  import { PrismaNeon } from '@prisma/adapter-neon';

  export function createPrisma(databaseUrl: string) {
    const adapter = new PrismaNeon({ connectionString: databaseUrl });
    return new PrismaClient({ adapter });
  }
  ```

  `DATABASE_URL` must be provided as a Vercel environment variable for the
  app/API and as a Cloudflare Worker secret for background automation.

  Each Worker handler (`fetch`, `scheduled`, `queue`) receives the
  Worker `env` and creates its own Prisma instance via
  `createPrisma(env.DATABASE_URL)`. Do not rely on a module-level
  global `env` object.

  ### Database Configuration

  Development:

  DATABASE_URL=<development Neon connection>

  Production:

  Store DATABASE_URL as a Vercel environment variable and as a Cloudflare
  Worker secret.

  Never expose DATABASE_URL to client-side code.

  ### Prisma Client

  Create the Prisma client factory through:

  lib/db/prisma.ts

  The module exports `createPrisma(databaseUrl)` for Worker/background
  invocations and `getPrisma()` for the Vercel app/API runtime.

  Cloudflare Worker invocations (`scheduled`, `queue`) create their own Prisma
  instance from `env.DATABASE_URL`. The Vercel app/API may reuse a process-level
  Prisma client through `getPrisma()` to avoid exhausting database connections.

  ### Migrations

  Development:

  1. Modify `prisma/schema.prisma`.
  2. Run:

     `npx prisma migrate dev --name <descriptive_name>`

  3. Review the generated SQL.
  4. Run database/integration tests.
  5. Commit `schema.prisma` and the generated migration.

  Production:

  Use:

  `npx prisma migrate deploy`

  Never use:

  `prisma db push`

  as the production schema-management mechanism.

  ### Migration Rules

  - Every schema change requires a migration.
  - Never edit an already-applied migration.
  - Never delete migration history from Git.
  - Never reset the production database.
  - Never run destructive development reset commands against production.
  - Review generated migration SQL before production.
  - Test every migration against an isolated staging/test database.
  - Prefer backward-compatible migrations.
  - Keep application and migration deployment ordering safe.
  - Database migrations must be version-controlled.

  ### Deployment Order

  CI / staging / production release process:

  1. Run tests.
  2. Build the application.
  3. Validate migrations.
  4. Apply migration to staging.
  5. Deploy to staging.
  6. Run staging smoke/E2E tests.
  7. Apply migration to production.
  8. Deploy to production.
  9. Run production smoke test.

  For backward-compatible changes, steps 7-9 may follow immediately
  after staging validation.

  For breaking schema changes, use a multi-release migration strategy:

  Release 1:
  - Add new schema elements.
  - Keep old schema elements working.

  Release 2:
  - Switch application code to the new schema.

  Release 3:
  - Remove old schema elements with a separate migration.

  ### Migration Testing

  CI must verify:

  - all migrations apply successfully from an empty database
  - migrations upgrade the previous-release schema successfully
  - `prisma migrate deploy` succeeds when no migrations are pending
  - migration history matches the committed migration files
  - database constraints are enforced
  - rollback/recovery procedure is documented
  - integration tests run against an isolated Neon test database/branch

  ### Prisma/Cloudflare Testing

  The test suite must verify Prisma database access from the
  same Worker-compatible runtime used by production.

  Test:

  - API database queries
  - Cron database queries
  - Queue consumer database queries
  - PostgreSQL transactions
  - row locking
  - concurrent quota reservations
  - migration compatibility

  ---

  ## Validation, Error Handling & User Messaging

  ### Core Rule

  Backend validation is the source of truth. Frontend validation provides
  immediate feedback only and must never be trusted for security,
  authorization, quotas, or business rules.

  Every API validates:
  - request body
  - query parameters
  - route parameters
  - files
  - authentication
  - authorization / ownership
  - business rules

  Database constraints remain the final data-integrity layer.

  ### Validation Layers

  1. Frontend form validation
  2. Backend schema validation
  3. Authentication validation
  4. Authorization and ownership validation
  5. Business-rule validation
  6. Database constraints

  ### Central Validation Structure

  ```
  lib/
    validation/
      common.ts
      auth.ts
      email-account.ts
      resume.ts
      contact.ts
      template.ts
      campaign.ts
      admin.ts
  ```

  Use one schema definition per resource. All APIs use centralized
  validation schemas. The same backend schema can be reused where practical
  for frontend form validation, but the API always validates again on the
  server.

  ### Standard API Response

  Success:

  ```json
  {
    "success": true,
    "data": {},
    "message": "Resume uploaded successfully."
  }
  ```

  Failure:

  ```json
  {
    "success": false,
    "error": {
      "type": "VALIDATION_ERROR",
      "message": "Please correct the highlighted fields.",
      "fields": {
        "email": "Enter a valid email address.",
        "name": "Name is required."
      }
    }
  }
  ```

  Never expose stack traces, SQL errors, provider credentials, internal
  exception messages, or infrastructure details to clients.

  ### HTTP Status Codes

  - `200` / `201` / `204` = success
  - `400` = validation error
  - `401` = authentication required
  - `403` = authorization failure
  - `404` = not found
  - `409` = conflict
  - `429` = rate limited
  - `502` / `503` = temporary provider/infrastructure problem
  - `500` = unexpected internal error

  ### Error Categories

  - `VALIDATION_ERROR`
  - `AUTHENTICATION_ERROR`
  - `AUTHORIZATION_ERROR`
  - `NOT_FOUND`
  - `CONFLICT`
  - `RATE_LIMITED`
  - `BUSINESS_ERROR`
  - `PROVIDER_ERROR`
  - `TEMPORARY_ERROR`
  - `INTERNAL_ERROR`

  ### User-Facing Messages

  Every failure must return a safe, professional, human-readable message.

  Examples:

  - Invalid email: `"Please enter a valid email address."`
  - Duplicate email account: `"This email account is already connected."`
  - SMTP authentication: `"We couldn't connect to your email account. Please check your credentials."`
  - Rate limit: `"You're doing that too frequently. Please wait a moment and try again."`
  - Daily limit: `"You've reached your daily email limit. Remaining emails will continue on the next available day."`
  - Unexpected: `"We couldn't complete your request. Please try again."`

  ### Rate Limit UI

  When the API returns HTTP `429`, display a clear rate-limit message to
  the user. Do not treat it as a generic error.

  Backend `429` responses should include:

  - `Retry-After` header when practical (seconds or HTTP-date)
  - JSON body:
    ```json
    {
      "success": false,
      "error": {
        "type": "RATE_LIMITED",
        "message": "You're doing that too frequently. Please wait a moment and try again.",
        "retryAfter": 60
      }
    }
    ```

  Frontend behavior:

  - Show the rate-limit message inline or as a toast/alert
  - Disable the triggering action while limited
  - If `retryAfter` is provided, show a countdown or "try again in X seconds"
  - Do not automatically retry the request
  - Do not show a stack trace or technical details

  Examples:

  - Login/register: `"Too many attempts. Please wait 5 minutes before trying again."`
  - Campaign create: `"You're creating campaigns too quickly. Please wait a moment."`
  - Resume upload: `"Too many uploads. Please wait before trying again."`
  - SMTP test: `"Too many test emails. Please wait a moment."`

  Rate-limit UI must be consistent across all endpoints and must not
  expose which specific Cloudflare rate-limit binding was hit.

  All important operations must support:
  - loading
  - success
  - information
  - warning
  - validation error
  - operation error
  - empty state

  Reusable components:

  ```
  components/ui/
    Toast.tsx
    Alert.tsx
    InlineFieldError.tsx
    FormMessage.tsx
    ConfirmDialog.tsx
    ErrorState.tsx
    EmptyState.tsx
    LoadingSpinner.tsx
  ```

  ### Field-Level Errors

  Backend validation errors must map to the appropriate form fields.

  Example:

  ```
  Email:
  "Enter a valid email address."

  App Password:
  "Please enter your Gmail App Password."
  ```

  Show errors beside the relevant field.

  ### Success Feedback

  Show professional confirmation after successful actions:

  - `"Gmail connected successfully."`
  - `"Resume uploaded successfully."`
  - `"Campaign created successfully."`
  - `"Campaign paused."`
  - `"Campaign cancelled."`
  - `"Email test sent successfully."`

  ### Warning / Information Feedback

  Examples:

  - `"You have used 18 of 20 emails today."`
  - `"This campaign will continue tomorrow because the daily limit is 20."`
  - `"Email delivery status is currently unknown."`
  - `"Your email account is inactive."`

  ### API Error Mapping

  Create:

  ```
  lib/errors/
    error-codes.ts
    error-handler.ts
    user-messages.ts
  ```

  Map internal error codes to safe user-facing messages.

  ### Internal Error Handling

  Log technical details internally with structured logging.

  Include:
  - request ID
  - user ID
  - job ID
  - campaign ID
  - provider
  - error code
  - HTTP status
  - internal error

  Never log:
  - SMTP passwords
  - OAuth refresh tokens
  - access tokens
  - encryption keys
  - full credentials

  ### Request ID

  Every API request receives a correlation/request ID.

  Return it when an operation fails so support/debugging can identify the
  exact server-side event without exposing technical details.

  ### Provider Errors

  Provider-specific responses are translated into application-level error
  codes before reaching the UI.

  Example:

  ```
  SMTP 535
    → SMTP_AUTH_FAILED
    → "We couldn't authenticate with your email provider. Please check your credentials."

  SMTP 4xx
    → PROVIDER_TEMPORARY_ERROR
    → "Your email provider is temporarily unavailable. We'll retry automatically."
  ```

  ### CSV Import

  Return an import summary:

  - imported count
  - duplicate count
  - invalid count
  - skipped count

  Show row-level validation problems when practical.

  ### Production Rule

  No API endpoint may return raw exceptions directly to the browser.
  All errors pass through the centralized error handler.

  ### Email Job Status Messages

  Translate technical statuses into understandable language:

  - `RETRY_WAIT` → `"Waiting to retry"`
  - `DELIVERY_UNKNOWN` → `"Delivery status unknown. We couldn't confirm whether the email provider accepted this message. It was not automatically sent again to avoid duplicate delivery."`

  Admin view should show more detail than normal users:

  Normal user:
  `"We couldn't send this email because the email provider rejected the request."`

  Admin:
  ```
  Provider: Gmail
  Status: SMTP authentication rejected
  SMTP response: 535 ...
  Attempt: 1/3
  Job ID: ...
  ```

  Never expose passwords or tokens.

  ### Response Contract Validation

  Validate important backend responses before returning them to the
  frontend. The worker/provider layer must not accidentally return
  malformed data such as `message: undefined` or missing required fields.

  Apply contract validation to responses for:

  - provider results
  - CSV import results
  - dashboard statistics
  - email job status
  - admin API responses

  Use the same typed response contracts throughout the application.
  Every successful response should include the expected shape, and every
  error response should include `type`, `message`, and optional `fields`.

  ---

  ## UI/UX Design System — Premium Apple-Inspired

  The application UI should feel premium, calm, minimal, polished, and
  highly consistent, inspired by modern Apple product design principles.

  This is an Apple-inspired design direction, not a copy of Apple's UI
  or branding.

  ### Design Principles

  - Minimal visual clutter
  - Strong typography hierarchy
  - Generous whitespace
  - Clear content grouping
  - Simple navigation
  - Subtle borders and shadows
  - Consistent rounded surfaces
  - Restrained use of color
  - Smooth and purposeful animations
  - Clear focus and interaction states
  - Content-first layouts
  - Desktop, tablet, and mobile responsive behavior

  Avoid:
  - excessive gradients
  - excessive shadows
  - excessive rounded cards
  - noisy dashboards
  - unnecessary decorative elements
  - dense tables without hierarchy
  - excessive colors
  - animations that distract from the task

  ### Design Tokens

  All visual values must be defined as design tokens. Components must
  consume tokens rather than hard-coding arbitrary spacing, colors,
  radius, shadows, or animation durations.

  Example token structure:

  ```
  tokens/
    colors/
      background
      surface
      text-primary
      text-secondary
      success
      warning
      error
      information
      selected
    spacing/
      4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px
    typography/
      page-title
      section-title
      body
      supporting
      caption
      metadata
    radius/
      sm = 8px
      md = 10–12px
      lg = 14–16px
      dialog = 18–20px
    shadows/
      subtle elevation levels
    motion/
      duration
      easing
  ```

  Do not introduce one-off literal values inside components when a
  token can express the same intent.

  ### Typography

  Use a system-first UI font stack appropriate for the platform.

  Example:

  ```
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif
  ```

  Use a clear type scale:

  - Page title
  - Section title
  - Body
  - Supporting text
  - Caption
  - Metadata

  Typography must provide hierarchy without relying on heavy font
  weights.

  ### Layout

  Use a consistent spacing system.

  Base spacing unit: `4px`

  Preferred spacing: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px`

  Pages should use:
  - predictable max-widths
  - consistent horizontal padding
  - consistent section spacing
  - balanced whitespace

  ### Surfaces

  Primary surfaces:
  - page background
  - elevated card
  - modal/dialog
  - popover
  - navigation surface

  Use subtle borders and restrained shadows.

  Cards should not look like separate floating boxes everywhere.
  Use cards only when grouping related information provides clear
  value.

  ### Border Radius

  Use a consistent radius scale:

  - small controls: `8px`
  - inputs/buttons: `10–12px`
  - cards: `14–16px`
  - dialogs: `18–20px`

  Do not mix arbitrary radius values.

  ### Colors

  Use a restrained neutral palette.

  Primary UI should be neutral and calm.

  Use color primarily for:
  - primary actions
  - success
  - warning
  - error
  - information
  - selected states

  Status must not depend only on color.
  Use icon + text + color where appropriate.

  ### Buttons

  Buttons must have:
  - clear hierarchy
  - primary / secondary / destructive variants
  - hover state
  - active state
  - focus state
  - disabled state
  - loading state

  Loading buttons must prevent duplicate submissions.

  ### Forms

  Forms must use:
  - clear labels
  - helpful descriptions where needed
  - inline validation errors
  - accessible focus states
  - disabled/loading states
  - consistent field spacing

  Do not rely on placeholder text as the field label.

  ### Navigation

  Desktop:
  - restrained sidebar/navigation
  - clear active state
  - predictable hierarchy

  Mobile:
  - compact mobile navigation
  - easily reachable primary actions
  - no horizontal overflow

  Navigation must remain visually simple and consistent across all
  pages.

  ### Dashboard

  The dashboard should prioritize:

  1. Important information
  2. Primary actions
  3. Current campaign state
  4. Email usage
  5. Recent activity
  6. Problems requiring attention

  Avoid turning the dashboard into a collection of unrelated cards.

  ### Tables

  Tables should:
  - prioritize important columns
  - remain readable
  - support sorting/filtering where useful
  - handle empty state
  - handle loading state
  - handle error state
  - work on mobile

  On small screens, use responsive alternatives such as stacked
  rows/cards where a table becomes unreadable.

  ### Status Design

  Use consistent status components.

  Examples:

  - `SCHEDULED` → Scheduled
  - `QUEUED` → Queued
  - `PROCESSING` → Sending
  - `RETRY_WAIT` → Waiting to retry
  - `SENT` → Sent
  - `FAILED` → Failed
  - `CANCELLED` → Cancelled
  - `DELIVERY_UNKNOWN` → Delivery status unknown

  Each status must have:
  - label
  - semantic color
  - optional icon
  - accessible text

  Do not expose raw internal terminology where a more understandable
  user-facing label exists.

  ### Feedback

  All operations use the shared feedback system:

  - inline field errors
  - toast
  - alert
  - warning
  - success
  - loading
  - empty state
  - error state
  - confirmation dialog

  Feedback should appear close to the action that caused it whenever
  possible.

  ### Motion

  Use subtle motion only when it improves understanding.

  Examples:
  - button loading transitions
  - dialog entrance/exit
  - toast entrance/exit
  - list updates
  - navigation transitions

  Animations must be short and unobtrusive.

  Respect: `prefers-reduced-motion`.

  ### Accessibility

  Target WCAG 2.2 AA behavior.

  Every interactive component must support:
  - keyboard navigation
  - visible focus
  - semantic HTML
  - accessible names
  - labels
  - error associations
  - dialog focus management
  - screen-reader-friendly status messages
  - reduced-motion preference

  ### Responsive Design

  Design mobile-first.

  Required breakpoints/layout validation:
  - Mobile
  - Tablet
  - Desktop
  - Large desktop

  Every page must remain functional without horizontal scrolling.

  ### Reusable UI Architecture

  All visual primitives must come from the shared component system.

  Example:

  ```
  components/ui/
    Button
    Input
    Select
    Textarea
    Dialog
    Dropdown
    DataTable
    Pagination
    Badge
    StatusBadge
    Toast
    Alert
    ConfirmDialog
    EmptyState
    LoadingSpinner
    ErrorState
    FileUpload
    DateTimePicker
  ```

  Feature pages must compose these components instead of creating
  inconsistent one-off controls.

  ### UI Consistency Rule

  Before creating a new UI component, check whether an existing shared
  component can be reused.

  If a new pattern is required:
  1. create it in the shared design system when reusable
  2. document its variants/states
  3. add component tests
  4. add accessibility tests
  5. use it consistently throughout the application

  ### Page UX Specifications

  **Login / Register**

  Very clean:

  ```
                    Logo

                Welcome back

       Continue with Google
               ─ OR ─

       Email
       [________________]

       Password
       [________________]

       [ Sign in ]

       Forgot password?
       Don't have an account? Sign up
  ```

  Large whitespace, minimal decoration, focused form.

  **Dashboard**

  Not a huge colorful admin dashboard.

  ```
  ┌─────────────────────────────────────────────────┐
  │ Mail Automation                     Account ◯   │
  ├──────────────┬──────────────────────────────────┤
  │ Dashboard    │                                  │
  │ Campaigns    │ Good morning                    │
  │ Emails       │ Here's what's happening today.   │
  │ Contacts     │                                  │
  │ Resumes      │  ┌────────┐ ┌────────┐           │
  │ Templates    │  │18/20   │ │ 12     │           │
  │ Email Accts  │  │sent    │ │queued  │           │
  │              │  └────────┘ └────────┘           │
  │              │                                  │
  │              │ Recent campaigns                 │
  │              │ ──────────────────────────────   │
  │              │                                  │
  └──────────────┴──────────────────────────────────┘
  ```

  Calm, spacious, strong typography.

  **Campaign Creation**

  Guided workflow:

  ```
  Create campaign

  01  Campaign
  02  Content
  03  Contacts
  04  Schedule
  05  Review

  ────────────────────────

  Campaign name
  [________________________]

  Sending account
  [ Gmail ▼ ]

  Resume
  [ My Resume.pdf ▼ ]

  Template
  [ Follow-up Template ▼ ]

                                Continue →

  Then a final review screen:

  Ready to launch

  ✓ Email account connected
  ✓ Resume selected
  ✓ Template ready
  ✓ 87 contacts
  ✓ 20 emails/day

  Starts tomorrow at 9:00 AM

                    [ Back ] [ Start Campaign ]
  ```

  ---

  ## Worker Handlers

  ### fetch()
  - Do not serve the Next.js app; Vercel owns the public app/API runtime
  - Return a minimal background Worker health/info response
  - Return a safe `404` for non-background routes
  - Keep all CRUD/API routes in the Vercel-hosted Next.js app
  - Keep the Worker bundle small enough for the Cloudflare Free-plan limit

  ### scheduled()
  - Run every minute
  - Atomically claim due jobs and update status to `QUEUED`:
    ```
    UPDATE email_jobs
    SET status = 'QUEUED'
    WHERE id IN (
      SELECT id FROM email_jobs
      WHERE
        (status = 'SCHEDULED' AND scheduled_at <= now())
        OR (status = 'RETRY_WAIT' AND next_attempt_at <= now())
      ORDER BY COALESCE(next_attempt_at, scheduled_at)
      LIMIT <batch_size>
    )
    AND status IN ('SCHEDULED', 'RETRY_WAIT')
    RETURNING id
    ```
  - Only enqueue IDs returned by that update
  - This prevents duplicate Queue messages if two scheduler executions overlap
  - Recover stuck jobs: reset `PROCESSING` jobs older than 10 minutes to `DELIVERY_UNKNOWN`

  ### queue()
  - Receive `emailJobId` from Queue
  - Atomically claim job: `UPDATE email_jobs SET status = 'PROCESSING', attempt_count = attempt_count + 1, processing_started_at = now() WHERE id = ? AND status = 'QUEUED' RETURNING *`
  - If no row returned, skip — already claimed
  - Load email account, contact, resume, template
  - Resolve provider via `EmailProviderFactory` based on `email_account.provider`
  - Build MIME email with attachment
  - Send via provider
  - Update job to `SENT` or `FAILED`

  > **Note:** Cloudflare Queue on the Free plan retains messages for
  > up to 24 hours. Queue is a delivery mechanism, not the source of
  > truth. `email_jobs` remains in Neon. If a Queue message expires
  > before delivery, Cron can re-enqueue the job on the next run if it
  > is still due.

  ---

  ## Email Sending Flow

  ```
  User creates campaign
      |
      v
  Create email_jobs (status = SCHEDULED)
      |
      v
  Cloudflare Cron (every minute)
      |
      v
  Find due jobs (status = SCHEDULED, scheduled_at <= now())
      |
      v
  Update status = QUEUED
      |
      v
  Cloudflare Queue
      |
      v
  Queue Consumer
      |
      v
  Atomically claim job (QUEUED -> PROCESSING)
      |
      v
   Load job from Neon
       |
       v
   Load resume from Backblaze B2 through the storage abstraction
       |
       v
  Resolve email provider via factory
      |
      v
  Build MIME email
      |
      v
  Email Provider (Gmail SMTP for MVP)
      |
      v
  Update status = SENT / FAILED / DELIVERY_UNKNOWN
  ```

  ### Campaign Scheduling Logic

  When a campaign is created, the application generates individual `email_jobs` with calculated `scheduled_at` values based on the campaign's `interval_minutes` and `daily_limit`.

  **Example:**
  ```
  100 contacts
  start = 09:00
  interval = 10 minutes
  daily_limit = 20
  ```

  **Generated jobs:**
  ```
  Day 1
  09:00 job 1
  09:10 job 2
  ...
  12:10 job 20

  Day 2
  09:00 job 21
  ...
  ```

  Cron only processes jobs where `scheduled_at <= now()`. The interval and daily limit are enforced at job-creation time, not by the consumer.

  > **Note (MVP):** The application generates all `email_jobs` at campaign creation time. For very large campaigns this may create many database rows. Future optimization: generate jobs in batches/windows rather than all at once.

  > **Timezone:** `campaigns.timezone` stores the user's preferred timezone (default `UTC`). The application converts the user's local `start_at` wall-clock time into an absolute UTC `scheduled_at` Timestamptz when generating jobs. Cloudflare Cron runs in UTC; all job timing is based on the absolute `scheduled_at` value, not wall-clock time.

  ### Campaign and Job Status

  **Campaign statuses:**
  - `DRAFT` — not yet started
  - `ACTIVE` — sending in progress
  - `PAUSED` — temporarily stopped
  - `COMPLETED` — all jobs finished
  - `CANCELLED` — stopped permanently

  **Job statuses:**
  - `SCHEDULED` — waiting for its `scheduled_at`
  - `QUEUED` — due, waiting for consumer
  - `PROCESSING` — being sent
  - `RETRY_WAIT` — temporary failure, waiting for `next_attempt_at`
  - `SENT` — email provider accepted the message
  - `FAILED` — permanent failure after max attempts
  - `CANCELLED` — explicitly cancelled
  - `DELIVERY_UNKNOWN` — provider acceptance unknown after Worker crash or timeout; requires admin review

  ### Pause / Cancel / Resume Behavior

  **Pause campaign:**
  - Campaign status → `PAUSED`
  - No new jobs are queued for this campaign
  - Already queued jobs may still be delivered to the consumer, but the consumer must re-check campaign status before sending: if `PAUSED` or `CANCELLED`, do not send and mark job as `CANCELLED`

  **Cancel campaign:**
  - Campaign status → `CANCELLED`
  - Remaining `SCHEDULED` jobs become `CANCELLED`
  - The consumer checks campaign status before sending: if `PAUSED` or `CANCELLED`, do not send and mark job as `CANCELLED`

  **Resume campaign:**
  - Campaign status → `ACTIVE`
  - Remaining `SCHEDULED` jobs continue from their existing `scheduled_at` values
  - Do not recreate already-cancelled jobs

  **Important:** `email_jobs` does not have a `PAUSED` status. Pause/cancel/resume is a campaign-level concept. Individual jobs can only be `CANCELLED`.

  ### Stuck-Job Recovery

  If a Worker crashes while a job is `PROCESSING`, the next Cron run should
  mark it `DELIVERY_UNKNOWN` rather than automatically retrying it.

  ```
  Cron
    |
    v
  Find jobs where status = 'PROCESSING'
  AND processing_started_at < now() - interval '10 minutes'
    |
    v
  Reset to DELIVERY_UNKNOWN
  ```

  `DELIVERY_UNKNOWN` means the provider may have accepted the message, but
  delivery status is unknown. Do not automatically re-send these jobs.

  Admin recovery for `DELIVERY_UNKNOWN` jobs and their `UNKNOWN` reservations:

  **If the recipient confirms receipt or external evidence shows delivery:**
  - Set `email_jobs.status = 'SENT'`
  - Set `email_send_reservations.status = 'COMMITTED'`
  - Set `email_send_reservations.resolved_at = now()`
  - Decrement `email_usage_daily.reserved_count`
  - Decrement `system_usage_daily.reserved_count`
  - IF `email_send_reservations.campaign_id IS NOT NULL` THEN
    - Decrement `campaign_usage_daily.reserved_count`
    - Increment `campaign_usage_daily.sent_count`
  - Increment `email_usage_daily.sent_count`
  - Increment `system_usage_daily.sent_count`

  Perform all updates in one PostgreSQL transaction.

  **If confirmed not delivered:**
  - Set `email_jobs.status = 'FAILED'`
  - Set `email_send_reservations.status = 'RELEASED'`
  - Set `email_send_reservations.resolved_at = now()`
  - Decrement `email_usage_daily.reserved_count`
  - Decrement `system_usage_daily.reserved_count`
  - IF `email_send_reservations.campaign_id IS NOT NULL` THEN
    - Decrement `campaign_usage_daily.reserved_count`

  **If unknown and no retry:**
  - Keep `email_jobs.status = 'DELIVERY_UNKNOWN'`
  - Keep `email_send_reservations.status = 'UNKNOWN'`
  - Reserved capacity stays consumed until a final decision is made.

  This prevents duplicate emails from being sent after Worker crashes.

  ### Provider Layer

  The email sending layer is provider-neutral. Each provider implements a common interface:

  ```ts
  interface EmailProvider {
    testConnection(): Promise<TestConnectionResult>;
    sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
    getCapabilities(): ProviderCapabilities;
  }

  interface ProviderCapabilities {
    supportsOAuth2: boolean;
    supportsAppPassword: boolean;
    supportsPassword: boolean;
    supportsAttachments: boolean;
  }
  ```

  **MVP provider:**
  - `lib/email/providers/gmail/` — Gmail SMTP with STARTTLS, AUTH LOGIN
    - `supportsAppPassword = true`
    - `supportsOAuth2 = true` (primary Gmail API transport; SMTP retained as fallback)
    - `supportsAttachments = true`

  **Future providers (shared contracts ready; adapters/configuration still required):**
  - `lib/email/providers/microsoft/` — Microsoft 365 OAuth2 + SMTP
  - `lib/email/providers/yahoo/` — Yahoo SMTP
  - `lib/email/providers/custom-smtp/` — Generic SMTP

  The Queue consumer resolves the provider at runtime:

  ```ts
  const provider = EmailProviderFactory.resolve(emailAccount.provider, { authMethod: emailAccount.auth_method });
  const capabilities = provider.getCapabilities();
  await provider.sendEmail({ ... });
  ```

  The reusable UI can use `ProviderCapabilities` to dynamically show/hide connection options without hard-coding provider behavior.

  ### Provider Registry / Feature Flags

  The database `email_accounts.provider` column supports all architecture types:

  ```sql
  provider IN ('gmail', 'microsoft', 'yahoo', 'custom_smtp')
  ```

  But the provider registry determines which providers are actually enabled at runtime:

  ```ts
  // lib/email/providers/registry.ts
  const ENABLED_PROVIDERS = new Set(['gmail']); // MVP: Gmail only
  ```

  This gives a clean feature-flag model:
  - DB schema is future-ready for all providers
  - Registry controls what is actually available
  - UI can query `ProviderCapabilities` to show only supported options
  - Adding a provider requires its tested adapter, account configuration and authorization lifecycle before registry enablement; campaign/job orchestration stays shared.

  ---

  ## Security Rules

  - Store provider credentials encrypted in Neon using an application-level encryption key
  - The encryption key must be stored separately from the database, not derived from user passwords
  - Never return credentials to the browser
  - Never log credentials
  - Authenticate every API request
  - **Explicit ownership check on every user-owned record: verify `record.user_id == currentUser.id` before any operation**
  - **Cross-reference ownership validation: when creating campaigns or jobs, verify all referenced records belong to the same user: `email_account.user_id`, `resume.user_id`, `template.user_id`, `contact.user_id` must all match `currentUser.id`**
  - Validate file uploads (PDF only, max 5MB)
  - Protect HTTP/API endpoints with app/platform rate limiting for request abuse protection
  - Enforce exact email sending quotas through EmailLimitService + Neon PostgreSQL
  - Do not send cancelled/paused jobs
  - Claim jobs atomically to prevent duplicates
  - Soft-delete resumes (`deleted_at`) instead of hard delete if referenced by pending jobs
  - Deactivate email accounts (`is_active = false`) instead of deleting if referenced by pending jobs
  - Do not trust browser-supplied `emailVerified` or similar fields; verify email status from the Neon Auth session

  ## Retry Policy

  Classify errors before retrying:

  **Temporary — retry:**
  - Network timeout
  - Connection reset
  - Temporary SMTP 4xx
  - Cloudflare infrastructure failure

  **Permanent — fail immediately:**
  - Invalid provider credentials
  - Invalid recipient
  - SMTP authentication rejected
  - Deleted/inactive email account

  **Retry schedule with backoff:**
  - Attempt 1: immediate
  - Attempt 2: `next_attempt_at = now() + 1-2 minutes`
  - Attempt 3: `next_attempt_at = now() + 5 minutes`

  **Retry flow:**
  ```
  Temporary failure
      |
      v
  attempt_count += 1
      |
      v
  next_attempt_at = now() + backoff
      |
      v
  status = RETRY_WAIT
      |
      v
  Cron picks it up when next_attempt_at <= now()
      |
      v
  Queue
      |
      v
  Consumer retries send
  ```

  **Initial policy:**
  - Maximum attempts: 3
  - After final failure: status = `FAILED`
  - Store reason in `error_message`

  ---

  ## API Endpoints (MVP)

  All application endpoints require authentication via Neon Auth. All user-owned records must be authorized by `user_id`.

  ```
  # Auth is handled by Neon Auth SDK
  # Application routes are protected by Neon Auth middleware

  GET    /api/email-accounts
  POST   /api/email-accounts
  POST   /api/email-accounts/:id/test
  DELETE /api/email-accounts/:id          # Deactivates account (is_active = false) if referenced by pending jobs

  GET    /api/resumes
  POST   /api/resumes
  DELETE /api/resumes/:id        # Soft-delete (deleted_at) if referenced by pending jobs
  POST   /api/resumes/:id/default

  GET    /api/contacts
  POST   /api/contacts
  PATCH  /api/contacts/:id
  DELETE /api/contacts/:id
  POST   /api/contacts/import-csv

  GET    /api/templates
  POST   /api/templates
  PATCH  /api/templates/:id
  DELETE /api/templates/:id

  GET    /api/campaigns
  POST   /api/campaigns
  GET    /api/campaigns/:id
  POST   /api/campaigns/:id/pause
  POST   /api/campaigns/:id/resume
  POST   /api/campaigns/:id/cancel

  GET    /api/emails
  GET    /api/emails/:id
  ```

  ---

  ## Admin

  ### Admin Model

  Roles:
  - `USER`
  - `ADMIN`

  Admin authentication uses Neon Auth.
  Admin authorization uses `users.role = 'ADMIN'`.

  Do not implement a complex RBAC/permissions system for MVP.

  The first admin must be created manually through a secure database operation. Do not allow users to choose `ADMIN` during registration.

  **First admin provisioning steps:**
  1. Register the owner's normal Neon Auth account through the application.
  2. Ensure the corresponding `public.users` row exists.
  3. Manually set `role = 'ADMIN'` in the database.
  4. Never expose an "admin registration" flow in the application.

  An `ADMIN` cannot disable or demote the last active `ADMIN`. This prevents accidentally locking all admin access.

  ### Admin Controls

  Admin can:

  - View all users
  - Search users
  - View user status
  - Enable/disable users
  - Set per-user daily email limit
  - Restore user to global default limit
  - View user email activity
  - View campaigns
  - Pause/cancel campaigns
  - View email jobs
  - View failures
  - Configure global daily email limit
  - Configure default user daily email limit
  - Enable/disable global email sending
  - View provider status

  Admin must never see provider passwords, SMTP App Passwords, OAuth refresh tokens, or other provider secrets. Encrypted credentials remain inaccessible.

  ### Global Limits

  `system_settings`:
  - `default_daily_email_limit`
  - `global_daily_email_limit`
  - `email_sending_enabled`

  ### Per-User Limits

  `users.daily_email_limit_override`:
  - `NULL` = use global default
  - numeric value = user-specific override

  ### Usage Tracking

  `email_usage_daily`:
  - `user_id`
  - `usage_date`
  - `sent_count`
  - `reserved_count`

  > **Note:** Currently tracks usage by `user_id` only. When multiple email
  > accounts per user are supported, extend this to `user_id + email_account_id`
  > or add a separate per-account usage table to enforce per-provider safety
  > limits alongside the user quota.

  `campaign_usage_daily`:
  - `campaign_id`
  - `usage_date`
  - `sent_count`
  - `reserved_count`

  `system_usage_daily`:
  - `usage_date`
  - `sent_count`
  - `reserved_count`

  ### Enforcement

  Email quotas are enforced server-side by the Queue consumer. Never rely on UI limits.

  `reserveEmailCapacity()` must execute the user, campaign, and global quota checks and increments inside one PostgreSQL transaction:

  ```
  BEGIN
    lock/update user daily usage row
    lock/update global daily usage row
    IF campaign_id IS NOT NULL THEN
      lock/update campaign daily usage row
      IF campaign.daily_limit IS NOT NULL THEN
        verify campaign sent_count + campaign reserved_count < campaign limit
      END IF
    END IF
    verify user sent_count + user reserved_count < user limit
    verify global sent_count + global reserved_count < global limit
    increment user reserved_count
    increment global reserved_count
    IF campaign_id IS NOT NULL THEN
      increment campaign reserved_count
    END IF
    insert reservation row (campaign_id may be NULL)
  COMMIT
  ```

  If `campaign_id` is `NULL`, the email is sent standalone and only user + global quotas apply. The campaign usage counters are not touched.

  If `campaign_id` is present but `campaign.daily_limit` is `NULL`, the campaign has no specific limit and the campaign quota check is skipped, but campaign usage may still be tracked.

  Never compare against `NULL` directly in SQL.

  No Redis or external locking service is required.

  Reserved capacity is separate from `sent_count`.

  - `reserved_count`: capacity reserved while a send is in progress
  - `sent_count`: counts successfully accepted sends only (SMTP `250` or provider equivalent)
  - Available capacity = `limit - sent_count - reserved_count`

  If the send fails before provider acceptance: release the reservation (`reserved_count -= 1`).
  If the provider accepts the message: the reservation becomes consumed usage (`reserved_count -= 1`, `sent_count += 1`).
  If the Worker crashes after provider acceptance: do not blindly retry the job; recover it as "potentially sent" to avoid duplicate delivery. The `reserved_count` stays reserved until admin review.

  Queue consumer checks:
  ```
  Global sending enabled?
      ↓
  User active?
      ↓
  User email verified?
      ↓
  Job has campaign_id?
      ↓
    YES → Campaign active?
      ↓
    YES → Campaign daily limit? (if campaign.daily_limit is set)
      ↓
  Global daily limit?
      ↓
  Provider active?
      ↓
  Reserve sending capacity
      ↓
  Send SMTP
  ```

  Single emails without a campaign (`campaign_id IS NULL`) skip campaign checks and are only limited by user + global quotas.

  **Important:** `SENT` means the email provider accepted the message for delivery (SMTP `250` or equivalent). It does not mean the email was delivered to the recipient's inbox. SMTP cannot prove inbox delivery.

  **Crash-safe accounting:** A quota reservation protects capacity while a send is in progress. If the Worker crashes after the provider accepts the message but before recording `SENT`, the system should prefer preventing duplicate sends where possible and treat the job as potentially sent rather than blindly retrying. `email_logs` should record the SMTP response alongside the final job status where practical.

  ### Daily Limit Behavior

  When a user, campaign, or global daily limit is exhausted:

  1. Do not mark the job as `FAILED`.
  2. Calculate the next available sending time:
    - If the limit resets at midnight UTC, set `scheduled_at` or `next_attempt_at` to the next day's sending window.
    - If using time-windowed limits, calculate the next window start.
  3. Set `status = 'RETRY_WAIT'` and `next_attempt_at = <calculated time>`.
  4. Do not leave the job in a state where Cron will reprocess it every minute.

  This prevents unnecessary Cron/DB/Queue traffic for jobs that cannot be sent yet.

  ### Emergency Kill Switch

  Admin can disable global email sending from `/admin/settings`. When disabled:
  - Cron does not enqueue new jobs
  - Queue consumer does not send emails

  ### Admin API

  All admin endpoints require `user.role = 'ADMIN'`.

  ```
  GET    /api/admin/dashboard

  GET    /api/admin/users
  GET    /api/admin/users/:id

  PATCH  /api/admin/users/:id
  POST   /api/admin/users/:id/disable
  POST   /api/admin/users/:id/enable

  GET    /api/admin/emails
  GET    /api/admin/campaigns

  POST   /api/admin/campaigns/:id/pause
  POST   /api/admin/campaigns/:id/cancel

  GET    /api/admin/settings
  PATCH  /api/admin/settings
  ```

  ### Admin Pages

  ```
  /admin
  /admin/users
  /admin/emails
  /admin/campaigns
  /admin/settings
  ```

  ### Email Limit Service

  All limit checks go through a single service:

  ```ts
  // lib/limits/email-limit-service.ts
  getEffectiveDailyEmailLimit(userId, campaignId?: string | null): Promise<number>
  reserveEmailCapacity({ userId, campaignId, emailJobId }: { userId: string; campaignId?: string | null; emailJobId: string }): Promise<ReservationResult>
  ```

  This keeps the application subscription-ready. Future plan types can be added without changing campaigns, Queue, consumer, dashboard, or admin logic:

  ```
  FREE    → 20/day
  PRO     → 100/day
  BUSINESS → 500/day
  ```

  The effective limit is the minimum of:
  - global limit
  - user's plan/override limit
  - campaign limit (if `campaignId` is present and `campaign.daily_limit` is set)

  ### Atomic Quota Reservation

  The Queue consumer must atomically reserve sending capacity before sending:

  ```ts
  const reservation = await emailLimitService.reserveEmailCapacity({
    userId,
    campaignId, // optional: null for standalone emails
    emailJobId
  });

  if (!reservation.success) {
    // Leave job SCHEDULED or move to RETRY_WAIT
    return;
  }

  // Send SMTP
  // On success: finalize usage
  // On failure: release reservation if needed
  ```

  This prevents two consumers from exceeding the limit simultaneously.

  `reserveEmailCapacity()` inserts a row in `email_send_reservations` (including `campaign_id`) and returns a reservation token/ID. The consumer must keep that reservation associated with the specific send attempt:

  ```
  reserveEmailCapacity({ userId, campaignId, emailJobId })
      ↓
  increment user reserved_count
  increment global reserved_count
  IF campaignId IS NOT NULL THEN
    increment campaign reserved_count
  END IF
  insert reservation row (campaign_id may be NULL, status = RESERVED)
      ↓
  reservation token
      ↓
  SMTP send
      ├── provider accepts → decrement affected reserved_count, increment affected sent_count, reservation = COMMITTED
      └── provider rejects before acceptance → decrement affected reserved_count, reservation = RELEASED
  ```

  If the Worker crashes after provider acceptance but before the reservation is resolved:
  - The reservation remains `RESERVED`
  - `reserved_count` stays consumed
  - Cron recovery must NOT blindly retry
  - Mark the job `DELIVERY_UNKNOWN`
  - Admin must review before retrying

  Do not rely on the reservation alone to determine final `sent_count`. `sent_count` is incremented only after provider acceptance.

  ### Campaign Daily Limit

  `campaigns.daily_limit` is nullable. `NULL` means no campaign-specific limit.

  The effective sending limit is:

  ```ts
  const effectiveLimit = min(
    system_settings.global_daily_email_limit,
    user's effective limit,
    campaign.daily_limit ?? Infinity
  );
  ```

  `reserveEmailCapacity()` uses the campaign ID to enforce this limit atomically with the user and global limits.

  ---

  ## Rate Limiting

  Use two separate systems for different purposes:

  **Application/platform rate limiting** - request/API abuse protection:
  - Login/register flooding
  - API endpoint abuse
  - CSV upload spam
  - Resume upload spam
  - Campaign creation spam
  - SMTP test endpoint abuse

  Request-abuse counters are not suitable for exact email quota accounting.

  **Neon PostgreSQL** - exact email quota accounting:
  - Per-user daily email limits
  - Global daily email limits
  - Subscription-based limits

  This separation keeps request-abuse protection independent from exact email
  accounting.

  ```
  REQUEST
    |
    v
  App/API Rate Limiting
    |
    +-- ALLOW
    |     |
    |     v
    |  Neon Auth
    |     |
    |     v
    |  Application API
    |
    +-- 429 Too Many Requests
  ```

  For actual sending:
  ```
  Queue Consumer
    -> EmailLimitService
    -> Neon PostgreSQL atomic quota
    -> Gmail SMTP
  ```

  Do not use request-abuse rate limiting for email quota accounting.

  ### Unauthenticated Rate Limits

  Apply app/API rate limiting before authentication for unauthenticated
  endpoints. Keys are based on IP + endpoint.

  Suggested initial limits:

  - `POST /register`: 5 requests / 10 minutes / IP
  - `POST /login`: 10 requests / 10 minutes / IP
  - `POST /forgot-password`: 5 requests / 10 minutes / IP
  - Verification resend: 5 requests / 10 minutes / IP

  ### Authenticated Rate Limits

  Apply app/API rate limiting after authentication for application APIs. Keys
  are based on the authenticated user ID + endpoint.

  Example keys:

  - `user:{userId}:campaign-create`
  - `user:{userId}:smtp-test`
  - `user:{userId}:resume-upload`

  When exceeded:
  - return HTTP 429
  - include `Retry-After` when practical

  These are abuse-protection limits only. They are not email-sending quotas.

  ### Rate Limit Configuration

  Use the application's rate-limit abstraction for Vercel API routes. If the
  public domain is proxied through Cloudflare later, Cloudflare WAF/rate-limit
  rules may be added at the edge, but the tiny background Worker does not need
  request-abuse rate-limit bindings.

  Do not use request-abuse rate limiting for exact email quota accounting.
  ## Testing Strategy

  Testing is a required part of every feature. No feature is considered
  complete until its automated tests pass.

  Testing must verify:

  - correct business logic
  - required fields
  - field types
  - field formats
  - boundary values
  - authorization
  - ownership isolation
  - authentication
  - database constraints
  - API responses
  - error handling
  - success handling
  - warning handling
  - rate limiting
  - quotas
  - retries
  - scheduling
  - Queue behavior
  - Worker behavior
  - provider behavior
   - SMTP behavior
   - Backblaze B2 storage behavior
   - UI behavior
  - complete end-to-end workflows

  ### Testing Stack

  - **Vitest** — unit, integration, service, validation, database, API,
    Worker, Cron, Queue, provider, quota, and UI component tests
  - **Playwright** — browser end-to-end tests
  - **TypeScript** — type checking
  - **ESLint** — static analysis

  ### Test Principles

  1. Backend is the source of truth.
  2. Every validation rule must have backend tests.
  3. Important frontend validation should also have tests.
  4. Every business rule must have positive and negative tests.
  5. Every protected API must have authorization tests.
  6. Every user-owned resource must have cross-user isolation tests.
  7. Every Worker handler must be tested.
  8. Cron scheduling logic must be tested with controlled/fake time.
  9. Queue consumer behavior must be tested.
  10. External services must be mocked in unit/integration tests and
      tested against real services in dedicated production/POC tests
      where safe.
  11. Every important user workflow must have at least one Playwright E2E
      test.
  12. A feature is not complete until its happy path and failure paths are
      tested.

  ### Vitest Coverage

  **Unit tests**

  Test every important pure function independently.

  Examples:

  - `lib/validation/common.ts`
  - `lib/validation/auth.ts`
  - `lib/validation/email-account.ts`
  - `lib/validation/resume.ts`
  - `lib/validation/contact.ts`
  - `lib/validation/template.ts`
  - `lib/validation/campaign.ts`
  - `lib/validation/admin.ts`

  Test:

  - valid input → accepted
  - missing required field → rejected
  - wrong type → rejected
  - empty string → rejected
  - too short → rejected
  - too long → rejected
  - invalid email → rejected
  - invalid UUID → rejected
  - invalid enum → rejected
  - boundary value → accepted/rejected correctly

  Examples:

  ```
  daily_limit = 20      ✅
  daily_limit = 1       ✅
  daily_limit = 0       ❌
  daily_limit = -1      ❌
  daily_limit = null    ✅ when allowed
  ```

  **Backend API tests**

  Every Route Handler should have tests.

  For every endpoint (`GET`, `POST`, `PATCH`, `DELETE`) test:

  - valid request
  - required fields
  - wrong types
  - malformed input
  - authentication missing
  - authentication expired
  - unverified user
  - wrong user resource
  - resource not found
  - duplicate/conflict
  - business-rule failure
  - rate limited
  - provider failure
  - database failure
  - unexpected exception
  - correct HTTP status
  - correct response shape
  - correct user-friendly message
  - no internal technical information exposed
  - request ID returned

  **Authentication tests**

  Test the complete Neon Auth integration boundary.

  - Registration: valid, duplicate email, invalid email, weak password,
    verification required, user profile created
  - Login: valid credentials, wrong password, unknown account, unverified
    account, rate limited, session created
  - Google OAuth: successful login, cancelled flow, failed flow,
    application profile created
  - Password reset: valid request, unknown email, rate limited,
    successful reset
  - Logout: valid session, expired session
  - Unverified user restrictions: cannot connect email, upload resume,
    create campaign, or send email

  **Authorization and multi-user isolation tests**

  Create User A, User B, and Admin. Then test:

  - User A can access A's resume; cannot access B's resume
  - User A can edit A's contact; cannot edit B's contact
  - User A cannot use B's email account, template, campaign, or email jobs
  - User A cannot access admin APIs
  - Cross-reference protection:
    - A's campaign + B's resume → rejected
    - A's campaign + B's email account → rejected
    - A's campaign + B's template → rejected

  **Database integration tests**

  Test actual PostgreSQL behavior through Prisma:

  - UNIQUE, PRIMARY KEY, FOREIGN KEY, CHECK constraints
  - NULL behavior
  - transactions
  - row locking
  - concurrent updates

  Test:

  - duplicate email account → rejected
  - invalid campaign status → rejected
  - negative counter → rejected
  - zero/negative limit → rejected
  - invalid foreign key → rejected

  **Prisma tests**

  Verify Prisma database access from the same Worker-compatible runtime
  used by production:

  - schema generation succeeds
  - migrations apply cleanly
  - repository/query tests
  - transaction tests
  - row-locking tests
  - concurrent quota reservations
  - production-like Worker database tests

  **Quota/concurrency tests**

  This is one of the most important test groups.

  Example:

  ```
  user limit = 20
  current sent = 19
  reserved = 0
  ```

  Run 20 concurrent reservations. Expected: exactly 1 succeeds,
  19 are rejected/deferred.

  Similarly:

  ```
  campaign limit = 5
  global limit = 500
  ```

  Run 100 concurrent queue consumers. Expected: campaign usage never
  exceeds 5, user usage never exceeds user limit, global usage never
  exceeds global limit.

  **Reservation lifecycle tests**

  Test every state transition:

  - `RESERVED` → `COMMITTED`: `reserved_count -= 1`, `sent_count += 1`
  - `RESERVED` → `RELEASED`: `reserved_count -= 1`, `sent_count` unchanged
  - `RESERVED` → `UNKNOWN`: `reserved_count` remains consumed
  - Admin confirms delivery: `reserved_count -= 1`, `sent_count += 1`
  - Admin confirms not delivered: `reserved_count -= 1`

  **Worker tests**

  Test the three Worker entry points separately.

  `fetch()`:
  - authenticated request
  - unauthenticated request
  - wrong method
  - unknown route
  - API response
  - error response
  - request ID
  - rate limit response

  `scheduled()`:
  - `SCHEDULED` + due → `QUEUED`
  - `SCHEDULED` + future → untouched
  - `RETRY_WAIT` + due → `QUEUED`
  - `RETRY_WAIT` + future → untouched
  - `PROCESSING` older than 10 min → `DELIVERY_UNKNOWN`
  - `CANCELLED` → untouched
  - `PAUSED` campaign → not queued

  `queue()`:
  - valid job → `SENT`
  - job already claimed → skipped
  - job cancelled → skipped
  - campaign paused → cancelled/no send
  - inactive user → no send
  - unverified user → no send
  - inactive email account → fail
  - missing resume → fail
  - missing template → fail
  - missing contact → fail
  - quota exceeded → deferred
  - provider success → `SENT`
  - provider permanent failure → `FAILED`
  - provider temporary failure → `RETRY_WAIT`
  - unknown provider outcome → `DELIVERY_UNKNOWN`

  **Retry tests**

  Test every classification:

  - Retry: network timeout, connection reset, SMTP 4xx,
    Cloudflare temporary failure → `attempt_count++`, `next_attempt_at`
    calculated, `RETRY_WAIT`
  - Do not retry: invalid credentials, invalid recipient, SMTP auth
    rejection, inactive account → `FAILED`
  - Maximum attempts: attempt 1, attempt 2, attempt 3 → `FAILED`

  **Cron scheduling tests**

  Use fake/mock time.

  Test:

  - 09:00 due
  - 09:01 due
  - 09:10 future
  - midnight boundary
  - day change
  - timezone handling
  - retry timing
  - daily quota reset

  Example:

  ```
  start 09:00
  interval 10 min
  daily limit 20
  ```

  Verify generated jobs are: 09:00, 09:10, 09:20, ..., 12:10,
  next day 09:00, ...

  **Email quota rollover tests**

  Test 23:59 and 00:00 next day.

  Expected: yesterday's usage does not block today.

  Also test user limit, campaign limit, and global limit independently
  and together.

  **SMTP/provider tests**

  *Unit tests* — mock the SMTP transport.

  Test:

  - connect success
  - connect timeout
  - TLS failure
  - AUTH failure
  - SMTP 250
  - SMTP 4xx
  - SMTP 5xx
  - connection reset
  - invalid recipient
  - MIME structure: From, To, Subject, body, PDF attachment,
    Content-Type, Content-Disposition, boundary, base64 encoding
  - credentials never appear in MIME/log output

  *Real POC/production integration test*

  Keep a separate opt-in integration test:

  ```
  REAL_GMAIL_SMTP_TEST=true
  ```

  This should never run automatically on every CI build.

   **Backblaze B2 Storage Tests**

   Test the storage abstraction and the B2 adapter.

   Unit tests:
   - upload validation
   - generated storage key
   - download
   - delete
   - metadata lookup
   - missing object
   - invalid object
   - size limit
   - wrong MIME type
   - fake PDF
   - B2 error mapping
   - timeout/error handling
   - authorization
   - cross-user object access prevention

   Integration tests:
   - upload real PDF to a controlled B2 test bucket
   - download object
   - verify object metadata
   - delete object
   - verify deleted object is unavailable
   - verify lifecycle/versioning behavior where applicable

   Security tests:
   - B2 credentials never reach the client
   - private bucket cannot be accessed anonymously
   - user A cannot access user B's resume
   - expired/invalid access cannot retrieve objects

  **UI component tests with Vitest**

  Test reusable UI components:

  - Button
  - Input
  - Select
  - Textarea
  - Dialog
  - Dropdown
  - DataTable
  - Pagination
  - SearchInput
  - Badge
  - StatusBadge
  - Toast
  - ConfirmDialog
  - EmptyState
  - LoadingSpinner
  - ErrorState
  - FileUpload
  - DateTimePicker

  Test:

  - renders correctly
  - props work
  - disabled state
  - loading state
  - error state
  - success state
  - click behavior
  - keyboard behavior
  - validation message
  - accessibility attributes

  **Form tests**

  Every form should test:

  - empty submission
  - required field
  - invalid value
  - boundary value
  - valid value
  - backend validation error
  - field mapping
  - success message
  - server error
  - loading state
  - button disabled state
  - retry behavior

  Examples: Gmail form, resume upload, contact form, CSV import,
  template form, campaign form, admin settings.

  **UI state tests**

  For every important operation, verify:

  - Initial → Loading → Success
  - Initial → Loading → Validation Error
  - Initial → Loading → Provider Error
  - Initial → Loading → 429
  - Initial → Loading → Unexpected Error

  Verify that the correct UI appears: spinner, toast, inline error,
  warning, alert, disabled button, error state, empty state.

  ### Playwright E2E Tests

  Playwright handles real browser end-to-end tests.

  **Authentication flows**

  - Registration: open `/register`, enter fields, submit,
    see verification message
  - Login: enter credentials, see dashboard
  - Google login: click Continue with Google, complete OAuth test flow,
    return to dashboard

  **Form validation**

  - Invalid email format shows inline error
  - Required field shows error on submit
  - Backend validation error appears after submit
  - Field-level errors map to correct inputs

  **UI states**

  - Loading spinners appear during submits
  - Success toasts appear after successful actions
  - Error states appear on failure
  - 429 shows rate-limit message and disables action
  - Empty states appear when no data exists

  **Dashboard workflows**

  - Dashboard loads with correct statistics
  - Campaign list shows correct statuses
  - Email history shows correct job statuses
  - Failure details are visible

  **Campaign workflows**

  - Create campaign with all required selections
  - See jobs generated with correct `scheduled_at`
  - Pause campaign → no new jobs queued
  - Cancel campaign → remaining jobs cancelled
  - Resume campaign → jobs continue

  **Admin workflows**

  - Admin can view users, emails, campaigns, settings
  - Admin can change user limits
  - Admin can disable/enable users
  - Admin can toggle global sending
  - Admin cannot see provider secrets

  **Responsive UI checks**

  Test at least Desktop, Tablet, Mobile for:

  - login
  - dashboard
  - email accounts
  - resume
  - contacts
  - campaigns
  - email history
  - admin

  **Full user journey (golden path)**

  Register → Verify email → Login → Connect Gmail → Test connection →
  Upload resume → Add HR contact → Create template → Create campaign →
  Schedule → Cron runs → Queue receives → Worker processes →
  Gmail accepts → Dashboard shows SENT

  **Failure-path E2E**

  Connect invalid Gmail → friendly error displayed → fix credentials →
  connection succeeds

  **Admin E2E**

  Admin login → view users → change user limit → disable user →
  enable user → global sending OFF → attempt campaign sending →
  no email sent → global sending ON → sending resumes

  ### Accessibility Tests

  Include:

  - keyboard navigation
  - focus visibility
  - labels
  - ARIA
  - button names
  - form errors
  - dialog behavior
  - color-independent status indicators

  Add accessibility assertions to Playwright E2E where practical.

  ### Visual Regression Testing

  Use Playwright screenshot assertions for critical screens.

  Capture approved screenshots for:
  - Login
  - Register
  - Dashboard
  - Email accounts
  - Resumes
  - Contacts
  - Templates
  - Campaign creation
  - Campaign details
  - Email history
  - Admin dashboard

  Run visual comparison in CI.

  Unexpected visual differences must require review before merge.

  Do not blindly auto-approve screenshot changes.

  ### Test Database Strategy

  Do not run integration tests against production Neon.

  Use `TEST_DATABASE_URL` with an isolated test database/branch.

  Test isolation:

  - before test → clean/prepare data
  - run test
  - after test → cleanup

  Parallel tests must not corrupt each other's data.

  ### Mocking Strategy

  Mock external services for ordinary automated tests:

  - Neon Auth
  - Gmail SMTP
   - Backblaze B2 (storage adapter)
  - Cloudflare Queue
  - App/platform rate limiting

  Have separate integration/E2E suites that use controlled real
  environments.

  Do not make the whole CI pipeline depend on Gmail or production
  Cloudflare.

  ### Coverage Requirements

  Add actual thresholds:

  - Statements: 90%+
  - Branches: 85%+
  - Functions: 90%+
  - Lines: 90%+

  For critical modules:

  - quota service: 95%+
  - scheduler: 95%+
  - queue consumer: 95%+
  - validation: 95%+
  - security/ownership: 95%+

  Don't chase 100% blindly. Critical business/security logic gets the
  highest coverage.

  ### CI Pipeline

  Pull Request pipeline:

  ```
  Install
    ↓
  Typecheck
    ↓
  Lint
    ↓
  Vitest unit tests
    ↓
  Vitest integration tests
    ↓
  Coverage check
    ↓
  Build
    ↓
  Worker bundle size check
    ↓
  Playwright E2E
    ↓
  PASS / FAIL
  ```

  A failed required test blocks merging.

  ### Worker Bundle Size

  Cloudflare's Workers Free plan has a 3 MB compressed Worker size
  limit. Prisma bundle size should be verified because Prisma's
  Cloudflare documentation warns about this constraint.

  Before production deployment:

  - Run `wrangler deploy --dry-run` or equivalent bundle-size check
  - Verify the compressed Worker bundle remains within the selected
    Cloudflare plan limit
  - Fail CI if the configured maximum is exceeded

  ### Deployment Smoke Tests

  After deployment to a staging/preview environment, run a separate
   smoke suite against the real Cloudflare Worker + Neon + Backblaze B2 + Queue
  + Cron environment. Local Playwright tests do not prove the deployed
  Worker and bindings are configured correctly.

  Deployment pipeline:

   ```
   Build
     ↓
   Deploy to staging/preview
     ↓
   Smoke test deployed Worker
     ↓
   GET /
     ↓
   Auth/session
     ↓
   Database
     ↓
   B2 connectivity
     ↓
   Queue
     ↓
   Cron
   ```

   The smoke test must verify the deployed Worker can reach Backblaze B2,
   but must not expose B2 credentials or detailed B2 errors publicly.
   Keep real Gmail SMTP testing as the opt-in integration test
   (`REAL_GMAIL_SMTP_TEST=true`).

  ### Test Commands

  ```json
  {
    "scripts": {
      "test": "vitest run",
      "test:watch": "vitest",
      "test:coverage": "vitest run --coverage",
      "test:integration": "vitest run tests/integration",
      "test:unit": "vitest run tests/unit",
      "test:e2e": "playwright test",
      "test:e2e:ui": "playwright test --ui",
      "test:all": "npm run test && npm run test:e2e",
      "test:smoke": "playwright test tests/e2e/smoke",
      "typecheck": "tsc --noEmit",
      "lint": "eslint .",
      "build": "next build",
      "build:worker": "wrangler deploy --dry-run",
      "deploy:worker": "wrangler deploy"
    }
  }
  ```

  `build` verifies the Vercel/Next.js app. `build:worker` verifies the tiny
  Cloudflare background Worker bundle and bindings without uploading.

  ### Test Directory Structure

  ```
  tests/
  ├── unit/
  │   ├── validation/
  │   ├── limits/
  │   ├── campaigns/
  │   ├── email/
  │   ├── security/
  │   └── ui/
  │
  ├── integration/
  │   ├── api/
  │   ├── db/
  │   ├── prisma/
  │   │   ├── schema-generation.test.ts
  │   │   ├── migrations.test.ts
  │   │   └── queries.test.ts
  │   ├── auth/
   │   ├── b2/
  │   ├── smtp/
  │   └── worker/
  │
  ├── worker/
  │   ├── scheduler.test.ts
  │   ├── consumer.test.ts
  │   └── fetch.test.ts
  │
  ├── e2e/
  │   ├── auth.spec.ts
  │   ├── email-account.spec.ts
  │   ├── resumes.spec.ts
  │   ├── contacts.spec.ts
  │   ├── templates.spec.ts
  │   ├── campaigns.spec.ts
  │   ├── dashboard.spec.ts
  │   └── admin.spec.ts
  │
  ├── fixtures/
  ├── mocks/
  └── helpers/
  ```

  ---

  ## Production Operations

  ### Deployment Rollback

  Every production deployment must have a known previous version.

  If production smoke tests fail:
  - stop further rollout
  - restore the previous Worker deployment/version
  - verify health endpoint and critical APIs
  - investigate before redeploying

  Database migrations must be backward-compatible with the currently
  deployed application version whenever possible.

  ### Health Endpoint

  `GET /api/health` returns minimal public status.

  Public response:

  ```json
  {
    "status": "ok",
    "version": "1.0.0"
  }
  ```

  Rules:
  - Do not expose secrets, credentials, or detailed infrastructure errors.
  - Return generic healthy/unhealthy status only.
  - Use this endpoint for deployment smoke tests and monitoring.

   Detailed dependency checks (`database`, `b2`, `queue`, `cron`)
  must remain internal/admin-only and must not be exposed on the
  public health endpoint.

  ### Monitoring and Alert Conditions

  Monitor for conditions that require attention:

  - Worker error rate increases
  - Queue backlog grows
  - Jobs remain `QUEUED`/`PROCESSING` too long
  - `DELIVERY_UNKNOWN` jobs appear
  - Gmail authentication failures increase
  - Repeated provider failures
  - Database connectivity failures
   - B2 failures
  - Free-tier usage approaches limits
  - Cron stops processing due jobs

  `DELIVERY_UNKNOWN` jobs must be visible to the admin immediately
  because those emails may have been sent. The plan already defines
  the state and admin recovery process.

  ### Database Recovery

  - Production database migrations must be version-controlled under
    `prisma/migrations/`.
  - Never modify production schema manually except controlled
    emergency procedures.
  - Test migrations against staging before production using
    `prisma/migrate deploy`.
  - Maintain a rollback/recovery procedure.
  - Verify Neon backup/restore capabilities before production launch.
  - Test restoring a staging copy periodically.
  - Never run automated tests against production data.

  ---

  ## Milestones

  ### Milestone 1 — Foundation
  - Create `mail-automation` project
  - Set up Neon PostgreSQL
  - Set up Neon Auth (`@neondatabase/auth/next/server`)
  - Configure `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET`
  - Create database schema
  - Configure Cloudflare Worker with Queue + Cron
  - Configure app/platform request-abuse rate limiting

  ### Milestone 2 — User Account
  - Neon Auth setup (NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET)
  - Registration via Neon Auth
  - Email verification flow via Neon Auth
  - Resend verification
  - Login via Neon Auth
  - Logout via Neon Auth
  - Protected dashboard using Neon Auth middleware
  - Block unverified users from sensitive actions

  ### Milestone 3 — Email Accounts
  - Email account page
  - Secure credential storage
  - Email account connection test
  - Email account disconnect

  ### Milestone 4 — Resume
   - Backblaze B2 configuration
  - Upload resume
  - List resumes
  - Delete resume
  - Default resume

  ### Milestone 5 — Contacts
  - Contact CRUD
  - Search
  - CSV import

  ### Milestone 6 — Templates
  - Template CRUD
  - Variable replacement

  ### Milestone 7 — Campaign
  - Create campaign
  - Select email account, resume, template, contacts
  - Set schedule
  - Create email jobs

  ### Milestone 8 — Automation
  - Cron finds due jobs
  - Queue sends job IDs
  - Consumer sends emails
  - Job claiming
  - Retry handling
  - Status updates

  ### Milestone 9 — Dashboard
  - Statistics
  - Campaign status
  - Email history
  - Failure details

  ### Milestone 10 — Admin
  - Admin role (`USER`, `ADMIN`)
  - First admin created manually via database
  - Admin dashboard (`/admin`)
  - Admin users page (`/admin/users`)
  - Admin emails page (`/admin/emails`)
  - Admin campaigns page (`/admin/campaigns`)
  - Admin settings page (`/admin/settings`)
  - Per-user daily email limit override
  - Global daily email limit
  - Global email sending enable/disable
  - Admin can never see provider secrets

  ### Milestone 11 — Production Hardening
  - Security review
  - Authentication review
  - Authorization review (explicit `user_id` checks on every operation)
  - SMTP secret review (encrypted with app-level key, stored separately from database)
  - Secret rotation/re-encryption procedure
  - Session/authentication security review
  - CSRF protection for cookie-authenticated mutations
  - Input/output schema validation for every API
  - Backend validation for every input (body, query, params, files)
  - Business-rule validation for every operation
  - Rate limiting
  - File validation
  - Atomic job claiming (`QUEUED` → `PROCESSING` with `UPDATE ... RETURNING`)
  - Retry classification with backoff (temporary vs permanent errors, 1-2 min and 5 min delays)
  - Stuck-job recovery (`PROCESSING` jobs older than threshold reset to `DELIVERY_UNKNOWN`; admin review required before retry)
  - Duplicate-send protection
  - Pause/cancel validation
  - Cron validation
  - Queue validation
  - Resume soft-delete when referenced by pending jobs
  - Email account deactivation when referenced by pending jobs
  - Database indexes verified (`email_jobs.status, scheduled_at`)
  - Production build
  - Custom domain
  - Error logging
  - Request/correlation IDs
  - Structured internal error logging
  - Centralized error handler
  - No raw technical errors exposed to users
  - Free-tier usage monitoring

  ### API Validation and Error-Handling Test Matrix

  For every API endpoint, verify behavior for:

  - valid input
  - missing required field
  - wrong type
  - invalid format
  - too long / too short
  - invalid enum
  - invalid UUID
  - unauthenticated request
  - authenticated but unauthorized resource
  - business-rule violation
  - duplicate / conflict
  - rate limited
  - provider failure
  - unexpected failure

  For each case, verify:

  - correct HTTP status
  - correct error code
  - safe user-facing message
  - field-level errors where applicable
  - no technical details exposed
  - request / correlation ID present
  - loading / success / warning / error UI states behave correctly

  ---

  ## What NOT to Build

  - Additional email providers (Gmail only for MVP; architecture supports Microsoft/Yahoo/custom SMTP later without redesign)
  - AI-generated emails
  - LinkedIn integration
  - Job scraping
  - Email analytics/open tracking
  - Complex team accounts
  - Payment system
  - Mobile app

  ---

  ## Cost Target

  Target hosting/service cost: **₹0/month** while usage remains within
   the documented free tiers of Cloudflare, Neon, Backblaze B2, Queue, and
  other required services.

  The application enforces its own email quotas and includes admin
  controls and usage monitoring to prevent uncontrolled growth.

  This is **not a guarantee of unlimited free operation**. Provider
  free-tier limits have hard ceilings:

  - Cloudflare Workers: 100,000 requests/day
  - Cloudflare Queue: 10,000 operations/day
   - Backblaze B2: 10 GB storage, 1M Class A ops/month, 10M Class B ops/month
  - Neon: current documented Free-plan compute/storage limits

  Free-tier limits must be verified against the current provider
  pricing/console configuration before launch. Exceeding these limits
  may require upgrading to paid plans.

  Start production with conservative limits:

  - `default_daily_email_limit` = 20
  - `global_daily_email_limit` = 500

   Raise limits after observing actual resource usage and confirming
   headroom remains within free tiers.

   ---

   ## Cloudflare Is Still Used

   Only the storage provider changed (Cloudflare R2 → Backblaze B2).
   Cloudflare remains the background automation platform:

   - Cloudflare Workers
   - Cloudflare Queues
   - Cloudflare Cron
   - Optional Cloudflare edge/WAF rate limiting if the public domain is proxied

   ```
                         Cloudflare
                    ┌──────────────────┐
                    │ Workers          │
                    │ Queues           │
                    │ Cron             │
                    │ Background Jobs  │
                    └────────┬─────────┘
                             │
               ┌─────────────┼──────────────┐
               ▼             ▼              ▼
           Neon DB       Neon Auth      Backblaze B2
                                          │
                                          ▼
                                      Resume PDFs
   ```

   Cloudflare Workers can make outbound HTTPS requests. Current Workers
   runtimes also have substantially expanded Node.js compatibility for
   compatible dates from August 2026 onward, which supports running the
   AWS SDK for JavaScript v3 (`@aws-sdk/client-s3`) against Backblaze's
   S3-Compatible API.

   ### One Important Correction

   The `wrangler.toml` must no longer contain an `[[r2_buckets]]` block.
   That configuration is specifically for Cloudflare R2. Instead, B2 is an
   external S3-compatible service, so its credentials/configuration belong
   in Worker secrets/environment configuration, and the B2 adapter creates
   the S3 client using the B2 endpoint. Backblaze's official implementation
   uses exactly this endpoint/region/credential model.

   ---

   ## Final Storage Decision

   ```
   ORIGINAL PLAN
   Cloudflare R2
         │
         │  DECISION CHANGED
         ▼
   CURRENT PLAN
   Backblaze B2 Cloud Storage
         │
         ├── S3-Compatible API
         ├── AWS SDK for JavaScript v3
         ├── Private bucket
         ├── Scoped application key
         ├── Server-side only
         ├── Lifecycle rules
         └── Storage abstraction
   ```

   This preserves the provider-ready architecture instead of hard-coding B2
   everywhere, while making Backblaze B2 the actual storage provider now.

   ---

   ## Definition of Done

  A user can:
  1. Register and log in
  2. Connect their email account
  3. Upload a resume
  4. Add HR contacts
  5. Create an email template
  6. Create a campaign
  7. Schedule emails
  8. Queue consumer sends automatically through the selected email provider
  9. HR receives email with resume
  10. User sees accurate results in dashboard

  The system handles:
  - Security
  - Scheduling
  - Retries
  - Failures
  - Cancellation
  - Pause
  - Duplicate prevention
  - Multi-user isolation
  - Backend validation for every input
  - Frontend field validation
  - Ownership validation
  - Business-rule validation
  - Database constraints
  - Friendly validation messages
  - Friendly provider error messages
  - Loading states
  - Success notifications
  - Warning notifications
  - Empty states
  - Error states
  - HTTP 429 handling
  - No raw technical errors exposed to users
  - Structured internal error logging
  - Request/correlation IDs
  - Shared UI design system applied consistently
  - Typography follows design tokens
  - Spacing follows design tokens
  - Colors follow semantic tokens
  - Loading/success/warning/error states are consistent
  - Mobile/tablet/desktop layouts verified
  - Accessibility verified
  - Reduced-motion behavior verified
  - Visual regression/E2E UI checks pass
  - Automated tests passing:
    - unit tests
    - integration tests
    - Worker tests
    - Cron/scheduler tests
    - Queue consumer tests
    - quota/concurrency tests
    - retry tests
    - error-handling tests
    - rate-limit tests
    - UI component tests
    - Playwright E2E workflows
    - Typecheck passes
    - Lint passes
    - Coverage thresholds pass
