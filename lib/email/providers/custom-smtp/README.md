# Custom SMTP provider (disabled)

Implement validated server configuration and an EmailProvider adapter here. Before enabling this provider, add host/port/TLS account settings and protect outbound connections against internal/private network access. Reuse ../smtp/transport.ts. No custom server credentials are accepted today.

Attachment extension point: implement `attachment-policy.ts` using `../attachment-policy.ts` and register it in `../attachment-policies.ts` when this provider is implemented. Define limits for the actual transport and account configuration; do not copy Gmail defaults. This provider remains disabled and has no attachment or send implementation.
