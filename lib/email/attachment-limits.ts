import { getAttachmentPolicy } from './providers/attachment-policies';
/** Shared storage/request caps. Provider-specific send limits live beside the transport. */
export const MAX_CAMPAIGN_ATTACHMENTS = 10;
export const MAX_CAMPAIGN_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function attachmentSelectionError(files: { size_bytes?: number | null }[], provider: string): string | null {
  const policy = getAttachmentPolicy(provider);
  if (!policy) return 'Sending attachments is not configured for this provider.';
  if (files.length > policy.maxCount) return `Select at most ${policy.maxCount} attachments.`;
  if (files.reduce((total, file) => total + (file.size_bytes ?? MAX_FILE_BYTES), 0) > policy.maxTotalBytes) {
    return `Attachments must total ${policy.maxTotalBytes / 1024 / 1024} MB or less.`;
  }
  if (files.some(file => (file.size_bytes ?? MAX_FILE_BYTES) > policy.maxFileBytes)) return `Each attachment must be ${policy.maxFileBytes / 1024 / 1024} MB or less.`;
  return null;
}
