# Campaign attachments

Campaign attachments are optional and start unselected. Select files in the Content step, review the filenames before scheduling, or leave the selection empty to send only the template.

The app accepts up to 10 uploaded PDFs per campaign, 5 MB per file, and 20 MB combined. These are app limits, not a Gmail attachment-count limit. Personal Gmail supports 25 MB total attachments ([Google documentation](https://support.google.com/mail/answer/6584?hl=en)). The lower app total leaves room for encoding. Oversized files are rejected; the app does not automatically create Google Drive links. Legacy files without recorded sizes reserve 5 MB each in the selector; the worker checks actual downloaded bytes before sending.

The API accepts `attachment_ids: []` or an array of unique attachment UUIDs. It checks ownership, availability, count, and combined stored size. Omitted attachments mean no files. The old `attachment_id` request remains supported, but cannot be combined with `attachment_ids`.

Campaigns and jobs store the selected IDs. The migration preserves existing single attachments and allows the legacy foreign key to be null. The worker checks each selected file's ownership and availability again and passes all files to MIME generation. Missing files stop the send rather than silently omitting an attachment.

Apply migrations with `npx prisma migrate deploy`, generate the client with `npx prisma generate`, build the web app, and deploy the worker with `npm run deploy:worker`. Both runtimes must be updated before using the new selection flow.
