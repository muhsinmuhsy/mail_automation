# Microsoft provider (disabled)

Implement an EmailProvider adapter here, with Microsoft authorization and token lifecycle support. Register its capabilities in ../registry.ts and its factory in ../factory.ts. The shared account routes must explicitly support its connection method before enabling the UI. No Microsoft credentials are accepted today.

Attachment extension point: implement `attachment-policy.ts` using `../attachment-policy.ts` and register it in `../attachment-policies.ts` when this provider is implemented. Define limits for the actual transport and account configuration; do not copy Gmail defaults. This provider remains disabled and has no attachment or send implementation.
