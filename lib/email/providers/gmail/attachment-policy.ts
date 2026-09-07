import type { AttachmentPolicy } from '../attachment-policy';

/** App limits for the current Gmail transport; not Google's attachment-count limit. */
export const gmailAttachmentPolicy: AttachmentPolicy = {
  provider: 'gmail', name: 'Gmail', maxCount: 10,
  maxTotalBytes: 20 * 1024 * 1024, maxFileBytes: 5 * 1024 * 1024,
};
