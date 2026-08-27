export function buildMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachment?: { filename: string; content: ArrayBuffer; contentType: string };
}): string {
  const boundary = `----=_Part_${crypto.randomUUID().replace(/-/g, '')}`;
  const lines: string[] = [];

  lines.push(`From: ${params.from}`);
  lines.push(`To: ${params.to}`);
  lines.push(`Subject: ${params.subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push('');
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: 7bit');
  lines.push('');
  lines.push(params.body);
  lines.push('');

  if (params.attachment) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${params.attachment.contentType}; name="${params.attachment.filename}"`);
    lines.push('Content-Disposition: attachment; filename="' + params.attachment.filename + '"');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    const bytes = new Uint8Array(params.attachment.content);
    const binary = String.fromCharCode(...bytes);
    const base64 = btoa(binary);
    lines.push(base64);
    lines.push('');
    lines.push(`--${boundary}--`);
  } else {
    lines.push(`--${boundary}--`);
  }

  return lines.join('\r\n');
}
