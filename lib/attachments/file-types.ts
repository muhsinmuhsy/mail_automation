/** Upload formats supported by the application, independent of email provider. */
export const ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', rtf: 'application/rtf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
};
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).map(ext => `.${ext}`).join(',');
export const ATTACHMENT_TYPE_DESCRIPTION = 'PDF, Word, Excel, PowerPoint, text, CSV, RTF, JPG, PNG, GIF and WebP';
export const fileExtension = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
export function attachmentContentType(name: string): string {
  return ATTACHMENT_TYPES[fileExtension(name)] ?? 'application/octet-stream';
}

/** Format checks are not a malware scanner; providers may reject unsafe contents. */
export function validAttachmentFormat(name: string, bytes: Uint8Array): boolean {
  const ext = fileExtension(name);
  if (!Object.hasOwn(ATTACHMENT_TYPES, ext)) return false;
  const starts = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
  const header = new TextDecoder().decode(bytes.subarray(0, 16));
  switch (ext) {
    case 'pdf': return header.startsWith('%PDF-');
    case 'png': return starts(137, 80, 78, 71, 13, 10, 26, 10);
    case 'jpg': case 'jpeg': return starts(255, 216, 255);
    case 'gif': return header.startsWith('GIF87a') || header.startsWith('GIF89a');
    case 'webp': return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
    case 'doc': case 'xls': case 'ppt': return starts(208, 207, 17, 224, 161, 177, 26, 225);
    case 'docx': case 'xlsx': case 'pptx': return starts(80, 75, 3, 4);
    case 'rtf': return header.startsWith('{\\rtf');
    case 'txt': case 'csv': return !bytes.includes(0);
    default: return false;
  }
}
