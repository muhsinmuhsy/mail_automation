import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';

describe('lib/security/encryption', () => {
  const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('should encrypt and decrypt a secret', async () => {
    const plaintext = 'my-app-password';
    const ciphertext = await encryptSecret(plaintext, key);
    const decrypted = await decryptSecret(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for same plaintext', async () => {
    const ciphertext1 = await encryptSecret('secret', key);
    const ciphertext2 = await encryptSecret('secret', key);
    expect(ciphertext1).not.toBe(ciphertext2);
  });

  it('should throw on invalid key length', async () => {
    await expect(encryptSecret('secret', 'short')).rejects.toThrow('Encryption key must be 64 hex characters');
  });

  it('should throw on corrupt ciphertext', async () => {
    await expect(decryptSecret('not-valid-base64!!!', key)).rejects.toThrow();
  });

  it('should handle empty string', async () => {
    const ciphertext = await encryptSecret('', key);
    const decrypted = await decryptSecret(ciphertext, key);
    expect(decrypted).toBe('');
  });

  it('should handle special characters', async () => {
    const plaintext = 'p@ssw0rd!日本語';
    const ciphertext = await encryptSecret(plaintext, key);
    const decrypted = await decryptSecret(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });
});
