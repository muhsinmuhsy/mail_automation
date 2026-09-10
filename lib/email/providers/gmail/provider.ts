import type { EmailProvider, SendEmailInput, SendEmailResult, ProviderCapabilities } from '../types';
import { base64url } from '../../oauth/state';
import { googleIdentity } from './oauth';
import { z } from 'zod';

/** Gmail REST transport. Credentials are refreshed by the account service. */
export class GmailApiProvider implements EmailProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  getCapabilities(): ProviderCapabilities {
    return { supportsOAuth2: true, supportsAppPassword: false, supportsPassword: false, supportsAttachments: true };
  }

  async testConnection(config: { email: string; secret: string }) {
    const identity = await googleIdentity(config.secret, this.fetcher);
    const success = identity.email === config.email.toLowerCase();
    return { success, message: success ? 'Google authorization is valid.' : 'The Google account does not match this connection. Reconnect the correct account.', provider: 'gmail' };
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    if (!input.credentials?.secret) return { success: false, errorType: 'permanent', error: 'Reconnect your Gmail account.', reconnectRequired: true };
    // Workers' native fetch must not receive the provider instance as `this`.
    const fetcher = this.fetcher;
    try {
      const response = await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST', headers: { Authorization: `Bearer ${input.credentials.secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: base64url(new TextEncoder().encode(input.mimeMessage)) }),
        signal: AbortSignal.timeout(30000),
      });
      // Once a send has been submitted, a lost response cannot safely be retried.
      const parsed = z.object({ id: z.string().optional(), error: z.object({ errors: z.array(z.object({ reason: z.string().optional() })).optional() }).optional() }).safeParse(await response.json().catch(() => null));
      const data = parsed.success ? parsed.data : null;
      if (response.ok) {
        const messageId = data?.id && /^[A-Za-z0-9_-]+$/.test(data.id) ? data.id : undefined;
        return { success: true, messageId, providerResponse: messageId ? `Gmail API accepted message ${messageId}.` : 'Gmail API accepted the message.' };
      }
      if (response.status === 401) return { success: false, errorType: 'permanent', reconnectRequired: true, error: 'Reconnect your Gmail account.' };
      const reasons: string[] = Array.isArray(data?.error?.errors) ? data.error.errors.map((entry: { reason?: string }) => entry.reason ?? '') : [];
      const temporary = response.status === 429 || response.status >= 500 || reasons.some(reason => ['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'backendError'].includes(reason));
      return { success: false, errorType: temporary ? 'temporary' : 'permanent', error: temporary ? 'Gmail is temporarily unavailable or its sending limit was reached. Will retry.' : 'Gmail rejected this message. Check account permissions and recipient details.' };
    } catch {
      return { success: false, errorType: 'unknown', error: 'Gmail may have accepted this message. Delivery requires review before sending again.' };
    }
  }
}
