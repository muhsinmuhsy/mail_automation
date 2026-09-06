export function base64url(bytes: Uint8Array): string {
  let binary = '';
  // Chunk conversion avoids millions of intermediate strings for attachments
  // and stays within the argument-count limit in Workers and Node.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(value: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

export const OAUTH_COOKIE = 'email_oauth_state';
export const OAUTH_TTL_SECONDS = 600;
