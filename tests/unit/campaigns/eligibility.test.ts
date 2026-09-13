import { describe, it, expect } from 'vitest';
import { detectMissingValues } from '@/lib/campaigns/eligibility';
import type { ContactFieldValueRow } from '@/lib/email/template-contact';

describe('lib/campaigns/eligibility — detectMissingValues (pure)', () => {
  const fieldDefs = [
    { id: 'f1', name: 'company', field_type: 'text' as const, label: 'Company' },
    { id: 'f2', name: 'role', field_type: 'text' as const, label: 'Role' },
  ];

  it('returns no missing values when all fields are populated', () => {
    const contacts = [
      {
        id: 'c1',
        name: 'Alice',
        email: 'alice@test.com',
        contact_field_values: [
          { field_id: 'f1', value: 'Acme' },
          { field_id: 'f2', value: 'Engineer' },
        ] as ContactFieldValueRow[],
      },
    ];
    const result = detectMissingValues('Hi {{name}}', 'Welcome to {{company}}, {{role}}', contacts, fieldDefs);
    expect(result.missingValues).toEqual([]);
    expect(result.unknownTokens).toEqual([]);
    expect(result.affectedContactIds.size).toBe(0);
  });

  it('detects missing custom field values', () => {
    const contacts = [
      {
        id: 'c1',
        name: 'Alice',
        email: 'alice@test.com',
        contact_field_values: [
          { field_id: 'f1', value: 'Acme' },
        ] as ContactFieldValueRow[],
      },
    ];
    const result = detectMissingValues('Hi', 'Welcome to {{company}}, {{role}}', contacts, fieldDefs);
    expect(result.missingValues).toHaveLength(1);
    expect(result.missingValues[0].token).toBe('role');
    expect(result.missingValues[0].contactIds).toEqual(['c1']);
    expect(result.affectedContactIds.has('c1')).toBe(true);
  });

  it('detects unknown tokens', () => {
    const contacts = [
      {
        id: 'c1',
        name: 'Alice',
        email: 'alice@test.com',
        contact_field_values: [] as ContactFieldValueRow[],
      },
    ];
    const result = detectMissingValues('Hi {{name}}', 'Welcome {{unknown_field}}', contacts, fieldDefs);
    expect(result.unknownTokens).toEqual(['{{unknown_field}}']);
  });

  it('does not flag built-in tokens (name, email) as missing', () => {
    const contacts = [
      {
        id: 'c1',
        name: null,
        email: 'alice@test.com',
        contact_field_values: [] as ContactFieldValueRow[],
      },
    ];
    const result = detectMissingValues('Hi {{name}}', 'Your email is {{email}}', contacts, fieldDefs);
    expect(result.missingValues).toEqual([]);
    expect(result.unknownTokens).toEqual([]);
  });

  it('handles empty contacts', () => {
    const result = detectMissingValues('Hi {{company}}', 'Body', [], fieldDefs);
    expect(result.missingValues).toEqual([]);
    expect(result.unknownTokens).toEqual([]);
  });

  it('handles empty template tokens', () => {
    const contacts = [
      {
        id: 'c1',
        name: 'Alice',
        email: 'alice@test.com',
        contact_field_values: [] as ContactFieldValueRow[],
      },
    ];
    const result = detectMissingValues('Hello', 'Plain text', contacts, fieldDefs);
    expect(result.missingValues).toEqual([]);
    expect(result.unknownTokens).toEqual([]);
  });

  it('aggregates affected contacts across multiple tokens', () => {
    const contacts = [
      {
        id: 'c1',
        name: 'Alice',
        email: 'alice@test.com',
        contact_field_values: [] as ContactFieldValueRow[],
      },
      {
        id: 'c2',
        name: 'Bob',
        email: 'bob@test.com',
        contact_field_values: [
          { field_id: 'f1', value: 'Acme' },
        ] as ContactFieldValueRow[],
      },
    ];
    const result = detectMissingValues('Hi {{company}} {{role}}', 'Body', contacts, fieldDefs);
    expect(result.affectedContactIds.size).toBe(2);
    expect(result.affectedContactIds.has('c1')).toBe(true);
    expect(result.affectedContactIds.has('c2')).toBe(true);
  });
});
