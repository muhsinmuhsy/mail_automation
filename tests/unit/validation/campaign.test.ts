import { describe, it, expect } from 'vitest';
import { createCampaignSchema } from '@/lib/validation/campaign';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const FINGERPRINT = 'a'.repeat(64);

function baseValidInput() {
  return {
    name: 'My Campaign',
    email_account_id: '550e8400-e29b-41d4-a716-446655440000',
    attachment_id: '550e8400-e29b-41d4-a716-446655440001',
    template_id: '550e8400-e29b-41d4-a716-446655440002',
    contact_ids: ['550e8400-e29b-41d4-a716-446655440003'],
    start_at: new Date('2024-01-15T09:00:00Z'),
    idempotency_key: VALID_UUID,
    preview_fingerprint: FINGERPRINT,
  };
}

describe('lib/validation/campaign', () => {
  it('accepts valid input', () => {
    expect(() =>
      createCampaignSchema.parse({
        ...baseValidInput(),
        timezone: 'UTC',
        interval_minutes: 10,
        daily_limit: 20,
      })
    ).not.toThrow();
  });

  it('applies default timezone', () => {
    const result = createCampaignSchema.parse({
      ...baseValidInput(),
      interval_minutes: 5,
    });
    expect(result.timezone).toBe('UTC');
  });

  it('applies default interval_minutes', () => {
    const result = createCampaignSchema.parse(baseValidInput());
    expect(result.interval_minutes).toBe(5);
  });

  it('rejects empty contact_ids', () => {
    expect(() =>
      createCampaignSchema.parse({
        ...baseValidInput(),
        contact_ids: [],
      })
    ).toThrow();
  });

  it('rejects invalid UUIDs', () => {
    expect(() =>
      createCampaignSchema.parse({
        ...baseValidInput(),
        email_account_id: 'invalid',
      })
    ).toThrow();
  });

  it('rejects negative interval_minutes', () => {
    expect(() =>
      createCampaignSchema.parse({
        ...baseValidInput(),
        interval_minutes: -1,
      })
    ).toThrow();
  });

  it('rejects zero daily_limit', () => {
    expect(() =>
      createCampaignSchema.parse({
        ...baseValidInput(),
        daily_limit: 0,
      })
    ).toThrow();
  });

  it('rejects timezone exceeding 64 chars', () => {
    expect(() =>
      createCampaignSchema.parse({
        ...baseValidInput(),
        timezone: 'a'.repeat(65),
      })
    ).toThrow();
  });
});
