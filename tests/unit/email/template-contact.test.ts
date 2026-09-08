import { describe, it, expect } from 'vitest';
import {
  buildTemplateContact,
  approvedTokenNames,
  BUILTIN_FIELD_NAMES,
  type ContactFieldDefinition,
  type ContactFieldValueRow,
} from '@/lib/email/template-contact';
import { replaceTemplateVariables } from '@/lib/email/template';

describe('lib/email/template-contact', () => {
  const fieldDefinitions: ContactFieldDefinition[] = [
    { id: 'field-size', name: 'size', field_type: 'text' },
    { id: 'field-plan', name: 'plan', field_type: 'text' },
    { id: 'field-birthdate', name: 'birthdate', field_type: 'date' },
  ];

  describe('buildTemplateContact', () => {
    it('flattens built-in fields into the result', () => {
      const result = buildTemplateContact(
        { name: 'Jane', email: 'jane@example.com', company: 'Acme', job_title: 'Eng' },
        [],
        []
      );
      expect(result.name).toBe('Jane');
      expect(result.email).toBe('jane@example.com');
      expect(result.company).toBe('Acme');
      expect(result.job_title).toBe('Eng');
    });

    it('flattens custom field values keyed by their token name', () => {
      const values: ContactFieldValueRow[] = [
        { field_id: 'field-size', value: 'M' },
        { field_id: 'field-plan', value: 'Pro' },
      ];
      const result = buildTemplateContact(
        { name: 'Jane', email: 'jane@example.com' },
        values,
        fieldDefinitions
      );
      expect(result.size).toBe('M');
      expect(result.plan).toBe('Pro');
    });

    it('exposes ONLY approved tokens — not raw Prisma fields', () => {
      const result = buildTemplateContact(
        { name: 'Jane', email: 'jane@example.com' },
        [],
        fieldDefinitions
      );
      // Built-ins + custom field names only.
      expect(Object.prototype.hasOwnProperty.call(result, 'name')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(result, 'email')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(result, 'size')).toBe(false);
      // Raw Prisma fields must NOT be present.
      expect(Object.prototype.hasOwnProperty.call(result, 'id')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result, 'user_id')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result, 'created_at')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result, 'updated_at')).toBe(false);
    });

    it('returns a prototype-less map (Object.create(null))', () => {
      const result = buildTemplateContact({ name: 'Jane' }, [], []);
      // Prototype-less: Object.getPrototypeOf returns null.
      expect(Object.getPrototypeOf(result)).toBeNull();
      // Inherited properties are not own properties and resolve to undefined.
      expect((result as Record<string, unknown>).constructor).toBeUndefined();
      expect((result as Record<string, unknown>).toString).toBeUndefined();
    });

    it('skips orphaned values whose field definition is missing', () => {
      const values: ContactFieldValueRow[] = [
        { field_id: 'field-size', value: 'M' },
        { field_id: 'deleted-field', value: 'orphan' },
      ];
      const result = buildTemplateContact({ name: 'Jane' }, values, fieldDefinitions);
      expect(result.size).toBe('M');
      expect(Object.prototype.hasOwnProperty.call(result, 'deleted-field')).toBe(false);
    });

    it('null values are preserved as null (distinguishable from missing)', () => {
      const values: ContactFieldValueRow[] = [
        { field_id: 'field-size', value: null },
      ];
      const result = buildTemplateContact({ name: 'Jane' }, values, fieldDefinitions);
      expect(result.size).toBeNull();
    });

    it('works end-to-end with replaceTemplateVariables', () => {
      const values: ContactFieldValueRow[] = [
        { field_id: 'field-size', value: 'M' },
        { field_id: 'field-plan', value: 'Pro' },
      ];
      const templateContact = buildTemplateContact(
        { name: 'Jane', email: 'jane@example.com', company: 'Acme' },
        values,
        fieldDefinitions
      );
      expect(
        replaceTemplateVariables('Hi {{first_name}}, your {{plan}} plan size is {{size}}.', templateContact)
      ).toBe('Hi Jane, your Pro plan size is M.');
    });

    it('prototype-pollution tokens resolve to undefined and are left as literals', () => {
      const templateContact = buildTemplateContact({ name: 'Jane' }, [], []);
      expect(replaceTemplateVariables('{{constructor}}', templateContact)).toBe('{{constructor}}');
      expect(replaceTemplateVariables('{{__proto__}}', templateContact)).toBe('{{__proto__}}');
      expect(replaceTemplateVariables('{{toString}}', templateContact)).toBe('{{toString}}');
    });
  });

  describe('approvedTokenNames', () => {
    it('returns built-ins + custom field names', () => {
      const tokens = approvedTokenNames(fieldDefinitions);
      expect(tokens).toContain('name');
      expect(tokens).toContain('email');
      expect(tokens).toContain('first_name');
      expect(tokens).toContain('size');
      expect(tokens).toContain('plan');
      expect(tokens).toContain('birthdate');
    });

    it('returns only built-ins when there are no custom fields', () => {
      expect(approvedTokenNames([])).toEqual([...BUILTIN_FIELD_NAMES]);
    });
  });
});
