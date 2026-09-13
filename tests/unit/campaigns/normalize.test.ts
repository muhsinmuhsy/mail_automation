import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  buildCreationKey,
  groupContactsByNormalizedEmail,
} from '@/lib/campaigns/normalize';

describe('lib/campaigns/normalize', () => {
  describe('normalizeEmail', () => {
    it('trims and lowercases', () => {
      expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    });

    it('handles null/undefined', () => {
      expect(normalizeEmail(null)).toBe('');
      expect(normalizeEmail(undefined)).toBe('');
    });

    it('handles empty string', () => {
      expect(normalizeEmail('')).toBe('');
    });

    it('preserves non-ASCII characters', () => {
      expect(normalizeEmail('  Üser@Éxample.COM  ')).toBe('üser@éxample.com');
    });

    it('is idempotent', () => {
      const email = 'User@Example.COM';
      expect(normalizeEmail(normalizeEmail(email))).toBe(normalizeEmail(email));
    });

    it('trims whitespace and lowercases', () => {
      expect(normalizeEmail('\tUser@Example.COM\n')).toBe('user@example.com');
    });
  });

  describe('buildCreationKey', () => {
    it('builds campaign:normalizedEmail format', () => {
      const campaignId = '550e8400-e29b-41d4-a716-446655440000';
      expect(buildCreationKey(campaignId, 'User@Example.COM')).toBe(
        '550e8400-e29b-41d4-a716-446655440000:user@example.com'
      );
    });

    it('is deterministic for the same input', () => {
      const campaignId = 'abc-123';
      expect(buildCreationKey(campaignId, 'a@b.com')).toBe(buildCreationKey(campaignId, 'a@b.com'));
    });

    it('produces different keys for different campaigns', () => {
      expect(buildCreationKey('camp-1', 'a@b.com')).not.toBe(buildCreationKey('camp-2', 'a@b.com'));
    });

    it('produces different keys for different addresses', () => {
      expect(buildCreationKey('camp-1', 'a@b.com')).not.toBe(buildCreationKey('camp-1', 'c@d.com'));
    });
  });

  describe('groupContactsByNormalizedEmail', () => {
    it('groups contacts by normalized email', () => {
      const contacts = [
        { id: '1', email: 'a@b.com' },
        { id: '2', email: 'A@B.COM' },
        { id: '3', email: 'c@d.com' },
      ];
      const groups = groupContactsByNormalizedEmail(contacts);
      expect(groups.get('a@b.com')).toEqual(['1', '2']);
      expect(groups.get('c@d.com')).toEqual(['3']);
    });

    it('preserves submission order within groups', () => {
      const contacts = [
        { id: 'first', email: 'a@b.com' },
        { id: 'second', email: 'A@B.COM' },
      ];
      const groups = groupContactsByNormalizedEmail(contacts);
      expect(groups.get('a@b.com')).toEqual(['first', 'second']);
    });

    it('handles empty input', () => {
      const groups = groupContactsByNormalizedEmail([]);
      expect(groups.size).toBe(0);
    });
  });
});
