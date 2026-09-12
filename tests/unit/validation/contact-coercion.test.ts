import { describe, it, expect } from 'vitest';
import { coerceValue, coerceValues } from '@/lib/validation/contact';

describe('coerceValue', () => {
  describe('null / empty input', () => {
    it('returns null for null input regardless of target type', () => {
      expect(coerceValue(null, 'text')).toEqual({ ok: true, newValue: null });
      expect(coerceValue(null, 'number')).toEqual({ ok: true, newValue: null });
      expect(coerceValue(null, 'date')).toEqual({ ok: true, newValue: null });
      expect(coerceValue(null, 'boolean')).toEqual({ ok: true, newValue: null });
    });

    it('returns null for empty string input regardless of target type', () => {
      expect(coerceValue('', 'text')).toEqual({ ok: true, newValue: null });
      expect(coerceValue('', 'number')).toEqual({ ok: true, newValue: null });
      expect(coerceValue('', 'date')).toEqual({ ok: true, newValue: null });
      expect(coerceValue('', 'boolean')).toEqual({ ok: true, newValue: null });
      expect(coerceValue('', 'dropdown')).toEqual({ ok: true, newValue: null });
    });
  });

  describe('target: text', () => {
    it('passes through any string as text', () => {
      expect(coerceValue('hello', 'text')).toEqual({ ok: true, newValue: 'hello' });
      expect(coerceValue('42', 'text')).toEqual({ ok: true, newValue: '42' });
      expect(coerceValue('2026-02-31', 'text')).toEqual({ ok: true, newValue: '2026-02-31' });
      expect(coerceValue('maybe', 'text')).toEqual({ ok: true, newValue: 'maybe' });
    });
  });

  describe('target: number', () => {
    it('accepts integer strings', () => {
      expect(coerceValue('42', 'number')).toEqual({ ok: true, newValue: '42' });
      expect(coerceValue('0', 'number')).toEqual({ ok: true, newValue: '0' });
      expect(coerceValue('-5', 'number')).toEqual({ ok: true, newValue: '-5' });
    });

    it('accepts decimal strings', () => {
      expect(coerceValue('3.14', 'number')).toEqual({ ok: true, newValue: '3.14' });
      expect(coerceValue('-0.5', 'number')).toEqual({ ok: true, newValue: '-0.5' });
    });

    it('rejects non-numeric strings', () => {
      const result = coerceValue('abc', 'number');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cannot convert "abc" to a number');
      }
    });

    it('rejects strings with mixed alpha and numeric', () => {
      expect(coerceValue('12abc', 'number').ok).toBe(false);
      expect(coerceValue('abc12', 'number').ok).toBe(false);
      expect(coerceValue('1.2.3', 'number').ok).toBe(false);
    });

    it('rejects empty-ish but non-null values that are not numeric', () => {
      expect(coerceValue('NaN', 'number').ok).toBe(false);
      expect(coerceValue('Infinity', 'number').ok).toBe(false);
    });
  });

  describe('target: date', () => {
    it('accepts valid calendar dates', () => {
      expect(coerceValue('2026-01-15', 'date')).toEqual({ ok: true, newValue: '2026-01-15' });
      expect(coerceValue('2000-02-29', 'date')).toEqual({ ok: true, newValue: '2000-02-29' });
      expect(coerceValue('1999-12-31', 'date')).toEqual({ ok: true, newValue: '1999-12-31' });
    });

    it('rejects impossible calendar dates', () => {
      const result = coerceValue('2026-02-31', 'date');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cannot convert "2026-02-31" to a date');
      }
    });

    it('rejects non-leap-year Feb 29', () => {
      expect(coerceValue('2026-02-29', 'date').ok).toBe(false);
    });

    it('rejects wrong format', () => {
      expect(coerceValue('2026/01/15', 'date').ok).toBe(false);
      expect(coerceValue('15-01-2026', 'date').ok).toBe(false);
      expect(coerceValue('not-a-date', 'date').ok).toBe(false);
    });

    it('rejects datetime with time component', () => {
      expect(coerceValue('2026-01-15T10:30:00Z', 'date').ok).toBe(false);
    });
  });

  describe('target: boolean', () => {
    it('accepts "true" and "false"', () => {
      expect(coerceValue('true', 'boolean')).toEqual({ ok: true, newValue: 'true' });
      expect(coerceValue('false', 'boolean')).toEqual({ ok: true, newValue: 'false' });
    });

    it('accepts "1" and "0"', () => {
      expect(coerceValue('1', 'boolean')).toEqual({ ok: true, newValue: '1' });
      expect(coerceValue('0', 'boolean')).toEqual({ ok: true, newValue: '0' });
    });

    it('accepts case-insensitive variants', () => {
      expect(coerceValue('TRUE', 'boolean')).toEqual({ ok: true, newValue: 'TRUE' });
      expect(coerceValue('False', 'boolean')).toEqual({ ok: true, newValue: 'False' });
    });

    it('rejects other strings', () => {
      const result = coerceValue('maybe', 'boolean');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cannot convert "maybe" to a boolean');
      }
      expect(coerceValue('yes', 'boolean').ok).toBe(false);
      expect(coerceValue('no', 'boolean').ok).toBe(false);
      expect(coerceValue('2', 'boolean').ok).toBe(false);
    });
  });

  describe('target: dropdown', () => {
    it('passes through any string as a dropdown value', () => {
      expect(coerceValue('free', 'dropdown')).toEqual({ ok: true, newValue: 'free' });
      expect(coerceValue('pro', 'dropdown')).toEqual({ ok: true, newValue: 'pro' });
      expect(coerceValue('any_value', 'dropdown')).toEqual({ ok: true, newValue: 'any_value' });
    });

    it('returns null for null or empty input', () => {
      expect(coerceValue(null, 'dropdown')).toEqual({ ok: true, newValue: null });
      expect(coerceValue('', 'dropdown')).toEqual({ ok: true, newValue: null });
    });
  });
});

describe('coerceValues', () => {
  it('returns ok with updates when all values coerce successfully', () => {
    const values = [
      { id: '1', value: '42' },
      { id: '2', value: '3.14' },
      { id: '3', value: null },
    ];
    const result = coerceValues(values, 'number');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updates).toEqual([
        { id: '1', value: '42' },
        { id: '2', value: '3.14' },
        { id: '3', value: null },
      ]);
    }
  });

  it('returns errors when any value fails coercion', () => {
    const values = [
      { id: '1', value: '42' },
      { id: '2', value: 'abc' },
      { id: '3', value: '3.14' },
    ];
    const result = coerceValues(values, 'number');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Cannot convert "abc" to a number');
    }
  });

  it('collects up to 5 errors and reports remaining count', () => {
    const values = [
      { id: '1', value: 'a' },
      { id: '2', value: 'b' },
      { id: '3', value: 'c' },
      { id: '4', value: 'd' },
      { id: '5', value: 'e' },
      { id: '6', value: 'f' },
      { id: '7', value: 'g' },
    ];
    const result = coerceValues(values, 'number');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(6);
      expect(result.errors[5]).toContain('and 2 more');
    }
  });

  it('handles empty input array', () => {
    const result = coerceValues([], 'text');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updates).toEqual([]);
    }
  });

  it('handles all-null values', () => {
    const values = [
      { id: '1', value: null },
      { id: '2', value: null },
    ];
    const result = coerceValues(values, 'date');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updates).toEqual([
        { id: '1', value: null },
        { id: '2', value: null },
      ]);
    }
  });

  it('works with date target type', () => {
    const values = [
      { id: '1', value: '2026-01-15' },
      { id: '2', value: '2026-02-31' },
    ];
    const result = coerceValues(values, 'date');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('Cannot convert "2026-02-31" to a date');
    }
  });

  it('works with boolean target type', () => {
    const values = [
      { id: '1', value: 'true' },
      { id: '2', value: 'maybe' },
    ];
    const result = coerceValues(values, 'boolean');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('Cannot convert "maybe" to a boolean');
    }
  });

  it('works with dropdown target type (passthrough)', () => {
    const values = [
      { id: '1', value: 'free' },
      { id: '2', value: 'pro' },
      { id: '3', value: null },
    ];
    const result = coerceValues(values, 'dropdown');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updates).toEqual([
        { id: '1', value: 'free' },
        { id: '2', value: 'pro' },
        { id: '3', value: null },
      ]);
    }
  });
});
