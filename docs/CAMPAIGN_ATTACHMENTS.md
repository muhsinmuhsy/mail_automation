# Campaign attachments

Campaign attachments are optional and start unselected. Select files in the Content step, review the filenames before scheduling, or leave the selection empty to send only the template.

Gmail currently allows up to 10 uploaded files per campaign, 5 MB per file, and 20 MB combined in this app. These are app limits, not Gmail's native limits. Personal Gmail supports 25 MB total attachments ([Google documentation](https://support.google.com/mail/answer/6584?hl=en)). Oversized files are rejected; the app does not automatically create Google Drive links. Legacy files without recorded sizes reserve 5 MB each; the worker checks actual downloaded bytes before sending.

Supported uploads are PDF, Word, Excel, PowerPoint, text, CSV, RTF, JPG, PNG, GIF and WebP. File extension and format checks run server-side; browser MIME metadata is not trusted. These checks are not malware scanning. The provider can still reject file contents. Archives, executables and scripts are not supported by this app.

Campaign choices preload through `/api/campaigns/options`, which authenticates once and reads the four lists in parallel without pagination-count queries. Users can name the campaign immediately. Choices refresh on window focus and when reopening an expired selection; in-flight requests are shared. A failed request exposes a retry action, not a permanent refresh button.

Provider-specific sending rules live in `lib/email/providers/gmail/attachment-policy.ts`. The shared `AttachmentPolicy` interface and policy registry are used by the UI, campaign API and worker. Only Gmail has an implementation. Future providers must register their own rules and transport before being enabled; unknown providers fail closed instead of inheriting Gmail limits. Shared upload formats live in `lib/attachments/file-types.ts` and shared storage/request caps remain separate from provider sending rules.

The API accepts `attachment_ids: []` or an array of unique attachment UUIDs. It checks ownership, availability, count, and combined stored size. Omitted attachments mean no files. The old `attachment_id` request remains supported, but cannot be combined with `attachment_ids`.

Campaigns and jobs store the selected IDs. The migration preserves existing single attachments and allows the legacy foreign key to be null. The worker checks each selected file's ownership and availability again and passes all files to MIME generation. Missing files stop the send rather than silently omitting an attachment.

Apply migrations with `npx prisma migrate deploy`, generate the client with `npx prisma generate`, build the web app, and deploy the worker with `npm run deploy:worker`. Both runtimes must be updated before using the new selection flow.
