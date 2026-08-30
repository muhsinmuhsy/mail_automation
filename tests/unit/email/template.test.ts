import { describe, it, expect } from 'vitest';
import {
  replaceTemplateVariables,
  SUPPORTED_TEMPLATE_VARIABLES,
} from '@/lib/email/template';

describe('lib/email/template', () => {
  const contact = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    company: 'Acme',
    job_title: 'Engineer',
  };

  it('substitutes known contact variables', () => {
    expect(replaceTemplateVariables('Hi {{name}}', contact)).toBe('Hi Jane Doe');
    expect(replaceTemplateVariables('{{email}}', contact)).toBe('jane@example.com');
    expect(replaceTemplateVariables('{{company}}', contact)).toBe('Acme');
    expect(replaceTemplateVariables('{{job_title}}', contact)).toBe('Engineer');
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
});
