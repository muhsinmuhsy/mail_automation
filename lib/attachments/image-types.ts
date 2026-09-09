/**
 * Image-only content-type validation for template image uploads.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §12. Restricts uploads to image types
 * only (png, jpeg, gif, webp) and validates magic bytes to reject spoofed
 * content types and executables.
 */

export const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export const IMAGE_ACCEPT = Object.keys(IMAGE_TYPES).map((ext) => `.${ext}`).join(',');
export const IMAGE_TYPE_DESCRIPTION = 'JPG, PNG, GIF and WebP';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Executable/dangerous extensions that must never be accepted, even if spoofed. */
const FORBIDDEN_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'cpl', 'dll', 'scr', 'js', 'mjs',
  'html', 'htm', 'svg', 'xhtml', 'php', 'py', 'rb', 'pl', 'sh',
  'jar', 'class', 'vbs', 'ps1', 'ps1m', 'app',
]);

export function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function imageContentType(name: string): string {
  return IMAGE_TYPES[fileExtension(name)] ?? 'application/octet-stream';
}

/**
 * Validate that the file is a supported image type by checking both the
 * extension whitelist and the magic-byte header. Rejects executables and
 * spoofed content types.
 */
export function validImageFormat(name: string, bytes: Uint8Array): boolean {
  const ext = fileExtension(name);

  if (FORBIDDEN_EXTENSIONS.has(ext)) return false;
  if (!Object.hasOwn(IMAGE_TYPES, ext)) return false;

  const starts = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
  const header = new TextDecoder().decode(bytes.subarray(0, 16));

  switch (ext) {
    case 'png':
      return starts(137, 80, 78, 71, 13, 10, 26, 10);
    case 'jpg':
    case 'jpeg':
      return starts(255, 216, 255);
    case 'gif':
      return header.startsWith('GIF87a') || header.startsWith('GIF89a');
    case 'webp':
      return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
    default:
      return false;
  }
}

/**
 * Sanitize a filename for storage in the Attachment model.
 * Strips path separators, control characters, and truncates to 255 chars.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, 255);
}
