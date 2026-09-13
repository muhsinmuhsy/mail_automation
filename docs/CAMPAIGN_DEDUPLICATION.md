# Campaign deduplication and send history

The production implementation specification is maintained at
[CAMPAIGN/_DEDUPLICATION.md](CAMPAIGN/_DEDUPLICATION.md).

It replaces the initial three-layer draft with immediate recipient awareness,
Neon PostgreSQL transaction guarantees, durable submission idempotency,
explicit resend rules, contact history, and production release gates.

Status: implementation-ready specification reviewed against the current code.
Production certification requires implementation and the release gates in
sections 9 and 10 of the linked document.
