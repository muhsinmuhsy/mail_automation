/** App limits leave room for MIME encoding within Gmail's message limit. */
export const MAX_CAMPAIGN_ATTACHMENTS = 10;
export const MAX_CAMPAIGN_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function attachmentSelectionError(files: { size_bytes?: number | null }[]): string | null {
  if (files.length > MAX_CAMPAIGN_ATTACHMENTS) return 'Select at most 10 attachments.';
  if (files.reduce((total, file) => total + (file.size_bytes ?? MAX_FILE_BYTES), 0) > MAX_CAMPAIGN_ATTACHMENT_BYTES) {
    return 'Attachments must total 20 MB or less.';
  }
  return null;
}
