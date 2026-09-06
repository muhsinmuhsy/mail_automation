import { describe, it, expect } from 'vitest';
import { Pool } from '@neondatabase/serverless';
import { decryptSecret } from '@/lib/security/encryption';
import { googleConfig, googleIdentity, requestTokens, GMAIL_SEND_SCOPE } from '@/lib/email/providers/gmail/oauth';

const address = process.env.GMAIL_LIVE_TEST_ACCOUNT;

// No messages are sent. This checks the actual OAuth grant and refresh flow,
// using real .env values only when explicitly launched via test:gmail:live.
describe.skipIf(!address)('Gmail OAuth with real local production configuration', () => {
  it('validates callback configuration and refreshes the connected Google grant', async () => {
    googleConfig(process.env, true);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query(`SELECT a.auth_method, a.is_active, a.granted_scopes,
        a.encrypted_refresh_token, a.provider_account_id
        FROM email_accounts a JOIN users u ON u.id = a.user_id
        WHERE a.provider = 'gmail' AND lower(a.email) = $1 AND lower(u.email) = $1`, [address]);
      expect(result.rowCount, 'Expected one connected account owned by this user').toBe(1);
      const account = result.rows[0];
      expect(account.auth_method).toBe('oauth2');
      expect(account.is_active).toBe(true);
      expect(account.granted_scopes).toContain(GMAIL_SEND_SCOPE);
      expect(Boolean(account.encrypted_refresh_token), 'Refresh token must be stored').toBe(true);
      const refresh = await decryptSecret(account.encrypted_refresh_token, process.env.SMTP_ENCRYPTION_KEY!);
      const tokens = await requestTokens(process.env, { grant_type: 'refresh_token', refresh_token: refresh });
      // Assert booleans so test failure reports can never serialize token values.
      expect(Boolean(tokens.access_token), 'Google must issue an access token').toBe(true);
      expect(tokens.expires_in > 0, 'Google must return a positive token lifetime').toBe(true);
      expect(tokens.scope?.split(' ').includes(GMAIL_SEND_SCOPE), 'Google must grant sending access').toBe(true);
      const identity = await googleIdentity(tokens.access_token);
      expect(identity.email).toBe(address);
      expect(identity.sub === account.provider_account_id, 'Google identity must match the stored connection').toBe(true);
    } finally { await pool.end(); }
  }, 60000);
});
