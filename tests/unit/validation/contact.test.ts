import { describe, it, expect } from 'vitest';
import {
  createContactSchema,
  updateContactSchema,
  buildCreateContactSchema,
  buildUpdateContactSchema,
  splitContactPayload,
  coerceValue,
  coerceValues,
  type ContactFieldDefinition,
} from '@/lib/validation/contact';

describe('lib/validation/contact', () => {
  describe('createContactSchema', () => {
    it('accepts valid input', () => {
      expect(() =>
        createContactSchema.parse({
          name: 'John Doe',
          email: 'john@example.com',
        })
      ).not.toThrow();
    });

    it('accepts input without optional fields', () => {
      expect(() =>
        createContactSchema.parse({
          name: 'John Doe',
          email: 'john@example.com',
        })
      ).not.toThrow();
    });

    it('accepts an empty name (name is optional)', () => {
      expect(() =>
        createContactSchema.parse({
          name: '',
          email: 'john@example.com',
        })
      ).not.toThrow();
    });

    it('accepts a missing name (name is optional)', () => {
      expect(() =>
        createContactSchema.parse({
          email: 'john@example.com',
        })
      ).not.toThrow();
    });

    it('rejects invalid email', () => {
      expect(() =>
        createContactSchema.parse({
          name: 'John Doe',
          email: 'not-an-email',
        })
      ).toThrow();
    });
  });

  describe('updateContactSchema', () => {
    it('accepts partial valid input', () => {
      expect(() =>
        updateContactSchema.parse({
          name: 'Jane Doe',
        })
      ).not.toThrow();
    });

    it('accepts empty object', () => {
      expect(() => updateContactSchema.parse({})).not.toThrow();
    });
  });
});

describe('lib/validation/contact — dynamic schemas (Path C, Phase 3)', () => {
  const fields: ContactFieldDefinition[] = [
    { id: 'f1', name: 'size', field_type: 'text', is_required: false },
    { id: 'f2', name: 'plan', field_type: 'text', is_required: true },
    { id: 'f3', name: 'age', field_type: 'number', is_required: false },
    { id: 'f4', name: 'birthdate', field_type: 'date', is_required: false },
    { id: 'f5', name: 'is_vip', field_type: 'boolean', is_required: false },
    { id: 'f6', name: 'required_number', field_type: 'number', is_required: true },
    {
      id: 'f7',
      name: 'tier',
      field_type: 'dropdown',
      is_required: false,
      options: [
        { value: 'free', label: 'Free' },
        { value: 'pro', label: 'Pro' },
      ],
    },
    {
      id: 'f8',
      name: 'required_tier',
      field_type: 'dropdown',
      is_required: true,
      options: [{ value: 'a', label: 'A' }],
    },
  ];

  describe('buildCreateContactSchema', () => {
    it('accepts built-in fields only when no custom values are provided', () => {
      const schema = buildCreateContactSchema([]);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts custom text fields', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        size: 'M',
        plan: 'Pro',
        required_number: 42,
        required_tier: 'a',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects when a required custom field is missing', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        size: 'M',
      });
      expect(parsed.success).toBe(false);
    });

    it('preserves 0 as a legitimate number value', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        plan: 'Pro',
        age: 0,
        required_number: 0,
        required_tier: 'a',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.age).toBe(0);
        expect(parsed.data.required_number).toBe(0);
      }
    });

    it('preserves false as a legitimate boolean value', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        plan: 'Pro',
        required_number: 1,
        is_vip: false,
        required_tier: 'a',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.is_vip).toBe(false);
      }
    });

    it('accepts a valid calendar date', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        plan: 'Pro',
        required_number: 1,
        birthdate: '2026-09-08',
        required_tier: 'a',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects an impossible calendar date like 2026-02-31', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        plan: 'Pro',
        required_number: 1,
        birthdate: '2026-02-31',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects a datetime string for a date field', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        plan: 'Pro',
        required_number: 1,
        birthdate: '2026-09-08T10:00:00Z',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects an invalid email', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({ name: 'Jane', email: 'not-an-email' });
      expect(parsed.success).toBe(false);
    });

    it('accepts a valid dropdown value', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        plan: 'Pro',
        required_number: 1,
        tier: 'free',
        required_tier: 'a',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects a dropdown value not in options', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        plan: 'Pro',
        required_number: 1,
        tier: 'invalid',
      });
      expect(parsed.success).toBe(false);
    });

    it('accepts a required dropdown value', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        plan: 'Pro',
        required_number: 1,
        required_tier: 'a',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects when a required dropdown is missing', () => {
      const schema = buildCreateContactSchema(fields);
      const parsed = schema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        plan: 'Pro',
        required_number: 1,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('buildUpdateContactSchema (PATCH semantics)', () => {
    it('allows omitting all fields (partial update)', () => {
      const schema = buildUpdateContactSchema(fields);
      const parsed = schema.safeParse({});
      expect(parsed.success).toBe(true);
    });

    it('allows clearing a custom field by setting it to null', () => {
      const schema = buildUpdateContactSchema(fields);
      const parsed = schema.safeParse({ size: null });
      expect(parsed.success).toBe(true);
    });

    it('allows updating a single custom field', () => {
      const schema = buildUpdateContactSchema(fields);
      const parsed = schema.safeParse({ size: 'L' });
      expect(parsed.success).toBe(true);
    });

    it('preserves 0 and false on PATCH', () => {
      const schema = buildUpdateContactSchema(fields);
      const parsed = schema.safeParse({ age: 0, is_vip: false });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.age).toBe(0);
        expect(parsed.data.is_vip).toBe(false);
      }
    });

    it('rejects an impossible date on PATCH', () => {
      const schema = buildUpdateContactSchema(fields);
      const parsed = schema.safeParse({ birthdate: '2026-02-31' });
      expect(parsed.success).toBe(false);
    });

    it('accepts a valid dropdown value on PATCH', () => {
      const schema = buildUpdateContactSchema(fields);
      const parsed = schema.safeParse({ tier: 'pro' });
      expect(parsed.success).toBe(true);
    });

    it('rejects an invalid dropdown value on PATCH', () => {
      const schema = buildUpdateContactSchema(fields);
      const parsed = schema.safeParse({ tier: 'invalid' });
      expect(parsed.success).toBe(false);
    });

    it('allows clearing a dropdown field by setting it to null on PATCH', () => {
      const schema = buildUpdateContactSchema(fields);
      const parsed = schema.safeParse({ tier: null });
      expect(parsed.success).toBe(true);
    });
  });

  describe('splitContactPayload', () => {
    it('separates built-in keys from custom keys', () => {
      const { builtins, custom } = splitContactPayload(
        { name: 'Jane', email: 'jane@example.com', size: 'M', plan: 'Pro', unknown: 'x' },
        fields
      );
      expect(builtins).toEqual({ name: 'Jane', email: 'jane@example.com' });
      expect(custom).toEqual({ size: 'M', plan: 'Pro' });
    });

    it('returns empty objects for an empty payload', () => {
      const { builtins, custom } = splitContactPayload({}, fields);
      expect(builtins).toEqual({});
      expect(custom).toEqual({});
    });
  });

  describe('coerceValue (§11.12, §11.22)', () => {
    it('text → text: always ok', () => {
      expect(coerceValue('hello', 'text')).toEqual({ ok: true, newValue: 'hello' });
    });

    it('text → number: valid', () => {
      expect(coerceValue('123', 'number')).toEqual({ ok: true, newValue: '123' });
      expect(coerceValue('12.5', 'number')).toEqual({ ok: true, newValue: '12.5' });
      expect(coerceValue('-7', 'number')).toEqual({ ok: true, newValue: '-7' });
    });

    it('text → number: rejects garbage', () => {
      expect(coerceValue('abc', 'number').ok).toBe(false);
      expect(coerceValue('1e10', 'number').ok).toBe(false);
    });

    it('text → number: empty string → null', () => {
      expect(coerceValue('', 'number')).toEqual({ ok: true, newValue: null });
      expect(coerceValue(null, 'number')).toEqual({ ok: true, newValue: null });
    });

    it('text → date: valid calendar date', () => {
      expect(coerceValue('2026-09-08', 'date')).toEqual({ ok: true, newValue: '2026-09-08' });
    });

    it('text → date: rejects impossible calendar date', () => {
      expect(coerceValue('2026-02-31', 'date').ok).toBe(false);
    });

    it('text → date: rejects datetime', () => {
      expect(coerceValue('2026-09-08T10:00:00Z', 'date').ok).toBe(false);
    });

    it('text → boolean: allowlist', () => {
      expect(coerceValue('true', 'boolean')).toEqual({ ok: true, newValue: 'true' });
      expect(coerceValue('false', 'boolean')).toEqual({ ok: true, newValue: 'false' });
      expect(coerceValue('1', 'boolean')).toEqual({ ok: true, newValue: '1' });
      expect(coerceValue('0', 'boolean')).toEqual({ ok: true, newValue: '0' });
      // Case-insensitive allowlist: 'TRUE' is accepted (§11.12).
      expect(coerceValue('TRUE', 'boolean').ok).toBe(true);
    });

    it('text → boolean: rejects non-allowlist values', () => {
      expect(coerceValue('maybe', 'boolean').ok).toBe(false);
      expect(coerceValue('yes', 'boolean').ok).toBe(false);
    });

    it('text → dropdown: passes through any string', () => {
      expect(coerceValue('free', 'dropdown')).toEqual({ ok: true, newValue: 'free' });
      expect(coerceValue('pro', 'dropdown')).toEqual({ ok: true, newValue: 'pro' });
    });

    it('text → dropdown: empty string → null', () => {
      expect(coerceValue('', 'dropdown')).toEqual({ ok: true, newValue: null });
      expect(coerceValue(null, 'dropdown')).toEqual({ ok: true, newValue: null });
    });
  });

  describe('coerceValues', () => {
    it('returns updates when all values coerce', () => {
      const result = coerceValues(
        [
          { id: 'v1', value: '123' },
          { id: 'v2', value: '456' },
        ],
        'number'
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updates).toHaveLength(2);
      }
    });

    it('returns errors when some values fail', () => {
      const result = coerceValues(
        [
          { id: 'v1', value: 'abc' },
          { id: 'v2', value: 'def' },
        ],
        'number'
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('caps errors at 5 and appends "…and N more"', () => {
      const values = Array.from({ length: 10 }, (_, i) => ({
        id: `v${i}`,
        value: 'bad',
      }));
      const result = coerceValues(values, 'number');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeLessThanOrEqual(6);
      }
    });
  });
});

