const ALGO = { name: 'AES-GCM', length: 256 } as const;
const IV_LENGTH = 12;

function getKeyBytes(keyHex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('Encryption key must be 64 hex characters (32 bytes).');
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function encryptSecret(plaintext: string, keyHex: string): Promise<string> {
  const keyBytes = getKeyBytes(keyHex);
  const key = await crypto.subtle.importKey('raw', keyBytes as unknown as BufferSource, ALGO, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const ciphertextArray = new Uint8Array(ciphertext);
  const combined = new Uint8Array(IV_LENGTH + ciphertextArray.length);
  combined.set(iv);
  combined.set(ciphertextArray, IV_LENGTH);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptSecret(ciphertextB64: string, keyHex: string): Promise<string> {
  const keyBytes = getKeyBytes(keyHex);
  const key = await crypto.subtle.importKey('raw', keyBytes as unknown as BufferSource, ALGO, false, ['decrypt']);
  const combined = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  if (combined.length < IV_LENGTH + 1) {
    throw new Error('Ciphertext is too short.');
  }
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext as unknown as BufferSource);
  return new TextDecoder().decode(decrypted);
}
