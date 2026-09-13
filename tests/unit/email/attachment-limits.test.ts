import { describe, expect, it } from 'vitest';
import { attachmentSelectionError as validateAttachments, MAX_CAMPAIGN_ATTACHMENT_BYTES } from '@/lib/email/attachment-limits';
import { createCampaignSchema } from '@/lib/validation/campaign';

const attachmentSelectionError = (files: { size_bytes?: number | null }[]) => validateAttachments(files, 'gmail');
const id = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
const body = { name: 'Campaign', email_account_id: id(1), template_id: id(2), contact_ids: [id(3)], start_at: '2030-01-01', idempotency_key: id(6), preview_fingerprint: 'a'.repeat(64) };
describe('optional campaign attachment limits', () => {
  it('accepts omitted, empty, multiple and legacy selections', () => {
    for (const selection of [{}, { attachment_ids: [] }, { attachment_ids: [id(4), id(5)] }, { attachment_id: id(4) }]) {
      expect(createCampaignSchema.safeParse({ ...body, ...selection }).success).toBe(true);
    }
  });
  it('rejects duplicate, invalid, excessive and ambiguous selections', () => {
    for (const selection of [{ attachment_ids: [id(4), id(4)] }, { attachment_ids: ['bad'] }, { attachment_ids: Array.from({ length: 11 }, (_, i) => id(i)) }, { attachment_ids: [], attachment_id: id(4) }]) {
      expect(createCampaignSchema.safeParse({ ...body, ...selection }).success).toBe(false);
    }
  });
  it('allows the exact byte boundary and rejects one byte over it', () => {
    expect(attachmentSelectionError([])).toBeNull();
    expect(attachmentSelectionError(Array.from({ length: 4 }, () => ({ size_bytes: MAX_CAMPAIGN_ATTACHMENT_BYTES / 4 })))).toBeNull();
    expect(attachmentSelectionError([{ size_bytes: MAX_CAMPAIGN_ATTACHMENT_BYTES }, { size_bytes: 1 }])).toMatch(/20 MB/);
  });
  it('reserves the upload maximum for legacy files with unknown size', () => {
    expect(attachmentSelectionError(Array.from({ length: 4 }, () => ({ size_bytes: null })))).toBeNull();
    expect(attachmentSelectionError(Array.from({ length: 5 }, () => ({})))).toMatch(/20 MB/);
    expect(attachmentSelectionError(Array.from({ length: 11 }, () => ({ size_bytes: 1 })))).toMatch(/10/);
  });
});
