# Yahoo provider (disabled)

Implement and test a Yahoo EmailProvider adapter here. Use the shared SMTP transport if appropriate, add validated account configuration, and register it in the shared registry/factory before enabling the UI. No Yahoo credentials are accepted today.

Attachment extension point: implement `attachment-policy.ts` using `../attachment-policy.ts` and register it in `../attachment-policies.ts` when this provider is implemented. Define limits for the actual transport and account configuration; do not copy Gmail defaults. This provider remains disabled and has no attachment or send implementation.
