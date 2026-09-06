import type { PrismaClient } from '../../generated/prisma/client';
import type { EmailAccount } from '../../generated/prisma/client';
import { decryptSecret, encryptSecret } from '../../security/encryption';
import { GMAIL_SEND_SCOPE, requestTokens, ReconnectRequiredError } from '../providers/gmail/oauth';

export async function gmailAccessToken(prisma: PrismaClient, account: EmailAccount, env: Record<string, unknown>, forceRefresh = false): Promise<string> {
  if (account.provider !== 'gmail' || account.auth_method !== 'oauth2' || !account.is_active || !account.encrypted_refresh_token || !account.granted_scopes.includes(GMAIL_SEND_SCOPE)) {
    throw new ReconnectRequiredError();
  }
  const key = String(env.SMTP_ENCRYPTION_KEY ?? '');
  if (!forceRefresh && account.encrypted_secret && account.access_token_expires_at && account.access_token_expires_at.getTime() > Date.now() + 60000) {
    return decryptSecret(account.encrypted_secret, key);
  }
  try {
    const token = await requestTokens(env, {
      grant_type: 'refresh_token', refresh_token: await decryptSecret(account.encrypted_refresh_token, key),
    });
    if (token.scope && !token.scope.split(' ').includes(GMAIL_SEND_SCOPE)) throw new ReconnectRequiredError();
    const saved = await prisma.emailAccount.updateMany({
      // A concurrent refresh, reconnect or disconnect must not be overwritten.
      where: { id: account.id, is_active: true, updated_at: account.updated_at, encrypted_refresh_token: account.encrypted_refresh_token },
      data: {
        encrypted_secret: await encryptSecret(token.access_token, key),
        ...(token.refresh_token ? { encrypted_refresh_token: await encryptSecret(token.refresh_token, key) } : {}),
        access_token_expires_at: new Date(Date.now() + token.expires_in * 1000), connection_error: null,
      },
    });
    if (!saved.count) {
      const current = await prisma.emailAccount.findUnique({ where: { id: account.id } });
      if (!current?.is_active || current.auth_method !== 'oauth2' || !current.encrypted_secret || !current.access_token_expires_at || current.access_token_expires_at.getTime() <= Date.now()) throw new ReconnectRequiredError();
      return decryptSecret(current.encrypted_secret, key);
    }
    return token.access_token;
  } catch (error) {
    if (error instanceof ReconnectRequiredError) {
      await prisma.emailAccount.updateMany({
        where: { id: account.id, updated_at: account.updated_at, encrypted_refresh_token: account.encrypted_refresh_token },
        data: { is_active: false, connection_error: 'reconnect_required', encrypted_secret: null, access_token_expires_at: null },
      });
    }
    throw error;
  }
}
