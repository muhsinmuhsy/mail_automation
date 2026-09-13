/**
 * Email address normalization for campaign deduplication.
 *
 * Per docs/CAMPAIGN/_DEDUPLICATION.md §3.1, the authoritative normalization is
 * PostgreSQL `lower(btrim(address))` — trim ASCII spaces + lowercase. This does
 * NOT strip Gmail dots, plus tags, or merge provider aliases.
 *
 * The database is the source of truth for normalization. These helpers mirror
 * `lower(btrim(...))` so JavaScript-side grouping/matching/fingerprinting stays
 * consistent with the SQL expression used in queries and the CHECK constraint.
 */

/**
 * Normalize an email address the same way PostgreSQL `lower(btrim(...))` does:
 * trim leading/trailing ASCII spaces, then lowercase. Returns the empty string
 * for null/undefined input.
 *
 * PostgreSQL `btrim` removes only spaces (not all Unicode whitespace), and
 * `lower` uses the database collation. For ASCII addresses this is equivalent
 * to JavaScript `trim().toLowerCase()`. Non-ASCII cases are verified in tests.
 */
export function normalizeEmail(address: string | null | undefined): string {
  if (address == null) return '';
  return address.trim().toLowerCase();
}

/**
 * Build the deterministic creation key for a campaign job:
 * `<campaign UUID>:<normalized recipient email>`.
 *
 * Used as `EmailJob.creation_key` for uniqueness within a campaign (§6.4).
 * The CHECK constraint `email_jobs_creation_key_valid` enforces this format
 * at the database level.
 */
export function buildCreationKey(campaignId: string, recipientEmail: string): string {
  return `${campaignId}:${normalizeEmail(recipientEmail)}`;
}

/**
 * Group contact IDs by their normalized email address. Within each group, the
 * first contact in submission order is the representative (§3.3 step 2).
 *
 * Returns a map from normalized address → ordered list of contact IDs.
 */
export function groupContactsByNormalizedEmail(
  contacts: ReadonlyArray<{ id: string; email: string }>
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const contact of contacts) {
    const key = normalizeEmail(contact.email);
    const group = groups.get(key) ?? [];
    group.push(contact.id);
    groups.set(key, group);
  }
  return groups;
}
