import { describe, it, expect } from 'vitest';
import {
  replaceTemplateVariables,
  SUPPORTED_TEMPLATE_VARIABLES,
  VARIABLE_PATTERN,
} from '@/lib/email/template';

describe('lib/email/template', () => {
  const contact = {
    name: 'Jane Doe',
    email: 'jane@example.com',
  };

  it('substitutes known contact variables', () => {
    expect(replaceTemplateVariables('Hi {{name}}', contact)).toBe('Hi Jane Doe');
    expect(replaceTemplateVariables('{{email}}', contact)).toBe('jane@example.com');
  });

  it('derives first_name from name', () => {
    expect(replaceTemplateVariables('Hello {{first_name}}', contact)).toBe('Hello Jane');
  });

  it('is case and whitespace insensitive', () => {
    expect(replaceTemplateVariables('{{ NAME }}', contact)).toBe('Jane Doe');
    expect(replaceTemplateVariables('{{ first_name }}', contact)).toBe('Jane');
  });

  it('leaves unknown variables untouched', () => {
    expect(replaceTemplateVariables('{{unknown}}', contact)).toBe('{{unknown}}');
  });

  it('handles null/empty contact fields without throwing', () => {
    expect(replaceTemplateVariables('{{name}} {{company}}', { name: 'Bob' })).toBe('Bob {{company}}');
    expect(replaceTemplateVariables('{{name}}', {})).toBe('{{name}}');
  });

  it('is idempotent on already-resolved text', () => {
    const resolved = replaceTemplateVariables('Hi Jane', contact);
    expect(replaceTemplateVariables(resolved, contact)).toBe('Hi Jane');
  });

  it('exposes the supported variable list', () => {
    expect(SUPPORTED_TEMPLATE_VARIABLES).toContain('name');
    expect(SUPPORTED_TEMPLATE_VARIABLES).toContain('first_name');
  });

  describe('custom merge tokens (Path C)', () => {
    const customContact = {
      name: 'Jane',
      email: 'jane@example.com',
      size: 'M',
      plan: 'Pro',
    };

    it('substitutes custom tokens defined on the contact map', () => {
      expect(replaceTemplateVariables('Size {{size}}', customContact)).toBe('Size M');
      expect(replaceTemplateVariables('{{plan}} plan', customContact)).toBe('Pro plan');
    });

    it('substitutes adjacent tokens', () => {
      expect(replaceTemplateVariables('{{name}}{{size}}', customContact)).toBe('JaneM');
    });

    it('is case-insensitive on custom tokens', () => {
      expect(replaceTemplateVariables('{{SIZE}}', customContact)).toBe('M');
      expect(replaceTemplateVariables('{{ Size }}', customContact)).toBe('M');
    });

    it('leaves unknown custom tokens as literals', () => {
      expect(replaceTemplateVariables('{{unknown}}', customContact)).toBe('{{unknown}}');
    });
  });

  describe('prototype-pollution safeguard (§11.26)', () => {
    const plainContact = { name: 'Jane', size: 'M' };

    it('leaves {{constructor}} as a literal token', () => {
      expect(replaceTemplateVariables('{{constructor}}', plainContact)).toBe('{{constructor}}');
    });

    it('leaves {{__proto__}} as a literal token', () => {
      expect(replaceTemplateVariables('{{__proto__}}', plainContact)).toBe('{{__proto__}}');
    });

    it('leaves {{toString}} as a literal token', () => {
      expect(replaceTemplateVariables('{{toString}}', plainContact)).toBe('{{toString}}');
    });

    it('leaves {{valueOf}} as a literal token', () => {
      expect(replaceTemplateVariables('{{valueOf}}', plainContact)).toBe('{{valueOf}}');
    });

    it('leaves {{hasOwnProperty}} as a literal token', () => {
      expect(replaceTemplateVariables('{{hasOwnProperty}}', plainContact)).toBe('{{hasOwnProperty}}');
    });

    it('still resolves real own properties', () => {
      expect(replaceTemplateVariables('{{name}}', plainContact)).toBe('Jane');
      expect(replaceTemplateVariables('{{size}}', plainContact)).toBe('M');
    });
  });

  describe('non-recursive resolution (§11.13)', () => {
    it('does not recursively resolve {{token}} inside a value', () => {
      const contactWithTokenValue = { name: 'Jane', size: '{{plan}}', plan: 'Pro' };
      expect(replaceTemplateVariables('{{size}}', contactWithTokenValue)).toBe('{{plan}}');
    });

    it('passes HTML/script values through as literal strings', () => {
      const xssContact = { name: 'Jane', size: '<script>alert(1)</script>' };
      expect(replaceTemplateVariables('{{size}}', xssContact)).toBe('<script>alert(1)</script>');
    });
  });

  describe('VARIABLE_PATTERN export (§11.19)', () => {
    it('matches {{token}}', () => {
      const matches = [...'Hi {{name}} and {{ size }}'.matchAll(VARIABLE_PATTERN)];
      expect(matches.map((m) => m[1])).toEqual(['name', 'size']);
    });

    it('is global (required for matchAll and String.replace)', () => {
      expect(VARIABLE_PATTERN.global).toBe(true);
    });
  });
});
