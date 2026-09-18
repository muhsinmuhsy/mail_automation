import { describe, it, expect } from 'vitest';
import {
  parseCustomFieldFilters,
  serializeCustomFieldFilters,
  customFieldFilterWhere,
  OPERATORS_BY_TYPE,
} from '@/lib/contacts/custom-field-filter';

describe('parseCustomFieldFilters', () => {
  it('returns empty array for null', () => {
    expect(parseCustomFieldFilters(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCustomFieldFilters('')).toEqual([]);
  });

  it('parses a single filter', () => {
    const result = parseCustomFieldFilters('abc-123:contains:manager');
    expect(result).toEqual([
      { fieldId: 'abc-123', op: 'contains', value: 'manager' },
    ]);
  });

  it('parses multiple filters', () => {
    const result = parseCustomFieldFilters('f1:eq:hello,f2:gt:100');
    expect(result).toEqual([
      { fieldId: 'f1', op: 'eq', value: 'hello' },
      { fieldId: 'f2', op: 'gt', value: '100' },
    ]);
  });

  it('handles values with colons (splits on first 2 colons only)', () => {
    const result = parseCustomFieldFilters('f1:eq:hello:world');
    expect(result).toEqual([
      { fieldId: 'f1', op: 'eq', value: 'hello:world' },
    ]);
  });

  it('skips malformed entries', () => {
    const result = parseCustomFieldFilters('f1:eq:valid,bad,nofield');
    expect(result).toEqual([
      { fieldId: 'f1', op: 'eq', value: 'valid' },
    ]);
  });

  it('skips entries with empty values', () => {
    const result = parseCustomFieldFilters('f1:eq:');
    expect(result).toEqual([]);
  });
});

describe('serializeCustomFieldFilters', () => {
  it('serializes filters to cf format', () => {
    const result = serializeCustomFieldFilters([
      { fieldId: 'f1', op: 'contains', value: 'manager' },
      { fieldId: 'f2', op: 'gt', value: '100' },
    ]);
    expect(result).toBe('f1:contains:manager,f2:gt:100');
  });

  it('returns empty string for empty array', () => {
    expect(serializeCustomFieldFilters([])).toBe('');
  });
});

describe('customFieldFilterWhere', () => {
  it('returns empty object for no filters', () => {
    expect(customFieldFilterWhere([])).toEqual({});
  });

  it('builds AND with EXISTS subqueries for each filter', () => {
    const result = customFieldFilterWhere([
      { fieldId: 'f1', op: 'contains', value: 'manager' },
    ]);
    expect(result).toEqual({
      AND: [
        {
          contactFieldValues: {
            some: {
              field_id: 'f1',
              value: { contains: 'manager', mode: 'insensitive' },
            },
          },
        },
      ],
    });
  });

  it('maps eq operator to equals', () => {
    const result = customFieldFilterWhere([
      { fieldId: 'f1', op: 'eq', value: 'hello' },
    ]);
    expect(result.AND).toEqual([
      expect.objectContaining({
        contactFieldValues: {
          some: {
            field_id: 'f1',
            value: { equals: 'hello' },
          },
        },
      }),
    ]);
  });

  it('maps before operator to lt', () => {
    const result = customFieldFilterWhere([
      { fieldId: 'f1', op: 'before', value: '2024-01-01' },
    ]);
    expect(result.AND).toEqual([
      expect.objectContaining({
        contactFieldValues: {
          some: {
            field_id: 'f1',
            value: { lt: '2024-01-01' },
          },
        },
      }),
    ]);
  });

  it('maps after operator to gt', () => {
    const result = customFieldFilterWhere([
      { fieldId: 'f1', op: 'after', value: '2024-01-01' },
    ]);
    expect(result.AND).toEqual([
      expect.objectContaining({
        contactFieldValues: {
          some: {
            field_id: 'f1',
            value: { gt: '2024-01-01' },
          },
        },
      }),
    ]);
  });

  it('maps is operator to equals', () => {
    const result = customFieldFilterWhere([
      { fieldId: 'f1', op: 'is', value: 'true' },
    ]);
    expect(result.AND).toEqual([
      expect.objectContaining({
        contactFieldValues: {
          some: {
            field_id: 'f1',
            value: { equals: 'true' },
          },
        },
      }),
    ]);
  });

  it('combines multiple filters with AND', () => {
    const result = customFieldFilterWhere([
      { fieldId: 'f1', op: 'contains', value: 'manager' },
      { fieldId: 'f2', op: 'gt', value: '100' },
    ]);
    expect(result.AND).toHaveLength(2);
  });
});

describe('OPERATORS_BY_TYPE', () => {
  it('has contains and eq for text', () => {
    expect(OPERATORS_BY_TYPE.text.map((o) => o.value)).toEqual(['contains', 'eq']);
  });

  it('has numeric comparisons for number', () => {
    expect(OPERATORS_BY_TYPE.number.map((o) => o.value)).toEqual(['eq', 'gt', 'gte', 'lt', 'lte']);
  });

  it('has date comparisons for date', () => {
    expect(OPERATORS_BY_TYPE.date.map((o) => o.value)).toEqual(['eq', 'before', 'after']);
  });

  it('has is for boolean', () => {
    expect(OPERATORS_BY_TYPE.boolean.map((o) => o.value)).toEqual(['is']);
  });

  it('has eq for dropdown', () => {
    expect(OPERATORS_BY_TYPE.dropdown.map((o) => o.value)).toEqual(['eq']);
  });
});
