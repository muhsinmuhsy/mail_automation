function randomBoundary(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `----=_Part_${uuid.replace(/-/g, '')}`;
}

function sanitizeHeaderValue(value: string): string {
  // Reject any control characters to prevent header injection.
  return value.replace(/[\r\n\t]/g, '').trim();
}

/**
 * RFC 2047 encode a header value that may contain non-ASCII characters.
 * ASCII-only strings are returned unchanged.
 */
export function encodeRfc2047(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) {
    return value;
  }
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(value)))
    : Buffer.from(value, 'utf-8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

export function formatMailboxAddress(name: string | undefined, email: string): string {
  const safeEmail = sanitizeHeaderValue(email);
  if (!name) {
    return safeEmail;
  }
  return `${encodeRfc2047(name)} <${safeEmail}>`;
}

function wrapBase64(input: string, lineLength = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < input.length; i += lineLength) {
    lines.push(input.slice(i, i + lineLength));
  }
  return lines.join('\r\n');
}

function base64Of(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Apply SMTP "dot-stuffing": any line beginning with a dot gets an extra
 * leading dot so it is not interpreted as the end-of-data marker.
 */
export function dotStuff(text: string): string {
  return text
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

export type Attachment = {
  filename: string;
  content: Uint8Array | ArrayBuffer;
  contentType: string;
};

export type BuildMimeOptions = {
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  subject: string;
  body: string;
  bodyContentType?: string;
  attachments?: Attachment[];
  messageId?: string;
  date?: Date;
  inReplyTo?: string;
  references?: string;
};

/**
 * Builds a standards-compliant MIME message (multipart/mixed when there are
 * attachments, otherwise a single text/plain part). All headers are
 * injection-safe and non-ASCII content is RFC 2047 encoded.
 */
export function buildMimeMessage(options: BuildMimeOptions): string {
  const {
    from,
    fromName,
    to,
    toName,
    subject,
    body,
    bodyContentType = 'text/plain; charset="UTF-8"',
    attachments = [],
    messageId,
    date,
    inReplyTo,
    references,
  } = options;

  const boundary = randomBoundary();
  const headers: string[] = [];

  headers.push(`From: ${formatMailboxAddress(fromName, from)}`);
  headers.push(`To: ${formatMailboxAddress(toName, to)}`);
  headers.push(`Subject: ${encodeRfc2047(sanitizeHeaderValue(subject))}`);
  headers.push(`Date: ${(date ?? new Date()).toUTCString()}`);
  headers.push(`Message-ID: <${messageId ?? `${randomBoundary()}@mail-automation>`}>`);
  if (inReplyTo) headers.push(`In-Reply-To: ${sanitizeHeaderValue(inReplyTo)}`);
  if (references) headers.push(`References: ${sanitizeHeaderValue(references)}`);
  headers.push('MIME-Version: 1.0');

  const bodyBytes = new TextEncoder().encode(body);
  const bodyB64 = wrapBase64(base64Of(bodyBytes));

  if (attachments.length === 0) {
    headers.push(`Content-Type: ${bodyContentType}`);
    headers.push('Content-Transfer-Encoding: base64');
    headers.push('');
    headers.push(bodyB64);
    return headers.join('\r\n');
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  headers.push('');
  headers.push(`--${boundary}`);
  headers.push(`Content-Type: ${bodyContentType}`);
  headers.push('Content-Transfer-Encoding: base64');
  headers.push('');
  headers.push(bodyB64);

  for (const attachment of attachments) {
    const bytes =
      attachment.content instanceof Uint8Array
        ? attachment.content
        : new Uint8Array(attachment.content);
    const encoded = wrapBase64(base64Of(bytes));
    const safeName = sanitizeHeaderValue(attachment.filename).replace(/["\\]/g, '');

    headers.push(`--${boundary}`);
    headers.push(
      `Content-Type: ${sanitizeHeaderValue(attachment.contentType)}; name="${safeName}"`
    );
    headers.push(`Content-Disposition: attachment; filename="${safeName}"`);
    headers.push('Content-Transfer-Encoding: base64');
    headers.push('');
    headers.push(encoded);
  }

  headers.push(`--${boundary}--`);
  return headers.join('\r\n');
}
