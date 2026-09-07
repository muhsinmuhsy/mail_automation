import type { AttachmentPolicy } from './attachment-policy';
import { gmailAttachmentPolicy } from './gmail/attachment-policy';

const policies: Readonly<Record<string, AttachmentPolicy>> = { gmail: gmailAttachmentPolicy };

/** Unknown/future providers must define their own rules; never inherit Gmail's. */
export function getAttachmentPolicy(provider: string): AttachmentPolicy | null {
  return Object.hasOwn(policies, provider) ? policies[provider] : null;
}
