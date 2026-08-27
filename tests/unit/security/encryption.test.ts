import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';

describe('lib/security/encryption', () => {
  const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('should encrypt and decrypt a secret', async () => {
    const plaintext = 'my-app-password';
    const encrypted = await encryptSecret(plaintext, key);
    const decrypted = await decryptSecret(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for the same plaintext', async () => {
    const plaintext = 'my-app-password';
    const encrypted1 = await encryptSecret(plaintext, key);
    const encrypted2 = await encryptSecret(plaintext, key);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should fail to decrypt with wrong key', async () => {
    const plaintext = 'my-app-password';
    const encrypted = await encryptSecret(plaintext, key);
    const wrongKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567';
    await expect(decryptSecret(encrypted, wrongKey)).rejects.toThrow();
  });

  it('should handle empty string', async () => {
    const plaintext = '';
    const encrypted = await encryptSecret(plaintext, key);
    const decrypted = await decryptSecret(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should handle long strings', async () => {
    const plaintext = 'a'.repeat(1000);
    const encrypted = await encryptSecret(plaintext, key);
    const decrypted = await decryptSecret(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });
});
