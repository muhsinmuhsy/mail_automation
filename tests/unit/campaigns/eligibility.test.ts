import { describe, it, expect, vi } from 'vitest';
import { detectMissingValues, computeEligibility } from '@/lib/campaigns/eligibility';
import { ResendEntryInvalidError } from '@/lib/errors';
import type { ContactFieldValueRow } from '@/lib/email/template-contact';

type MockContact = {
  id: string;
  name: string | null;
  email: string;
  user_id: string;
  contact_field_values: { field_id: string; value: string }[];
};

type MockTemplate = {
  id: string;
  subject: string;
  body: string;
  body_text: string | null;
  body_html: string | null;
};

function makeMockDb(opts: {
  contacts: MockContact[];
  template: MockTemplate | null;
  historyRows?: Array<{ normalized_email: string; status: string; sent_at: Date | null; scheduled_at: Date | null; id: string }>;
}): never {
  const contactEmails = opts.contacts.map((c) => c.email);
  const normRows = contactEmails.map((e) => ({ original: e, normalized: e.trim().toLowerCase() }));
  const historyRows = opts.historyRows ?? [];

  const db = {
    contact: {
      findMany: vi.fn().mockResolvedValue(opts.contacts),
    },
    contactField: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    template: {
      findFirst: vi.fn().mockResolvedValue(opts.template),
    },
    $queryRaw: vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('lower(btrim(original))')) {
        return Promise.resolve(normRows);
      }
      if (sql.includes('lower(btrim(to_email))')) {
        return Promise.resolve(historyRows);
      }
      return Promise.resolve([]);
    }),
    $executeRaw: vi.fn().mockResolvedValue(undefined),
  };

  return db as never;
}

const baseInput = {
  userId: 'user-1',
  templateId: 'template-1',
  emailAccountId: 'account-1',
  attachmentIds: [] as string[],
  missingValueAction: 'exclude' as const,
  unknownTokenAction: 'fix' as const,
  startAt: new Date('2026-09-13T12:00:00Z'),
  timezone: 'UTC',
  intervalMinutes: 5,
  dailyLimit: null as number | null,
};

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

describe('computeEligibility — strict resend validation (Fix #2)', () => {
  const template: MockTemplate = {
    id: 'template-1',
    subject: 'Hello {{name}}',
    body: 'Body',
    body_text: 'Body',
    body_html: null,
  };

  it('throws ResendEntryInvalidError when resend contact is not in selected recipients', async () => {
    const contacts: MockContact[] = [
      { id: 'c1', name: 'Alice', email: 'alice@test.com', user_id: 'user-1', contact_field_values: [] },
    ];
    const db = makeMockDb({ contacts, template });

    await expect(
      computeEligibility(db, {
        ...baseInput,
        contactIds: ['c1'],
        resendRecipients: [{ contactId: 'c-not-selected', recipientEmail: 'other@test.com' }],
      })
    ).rejects.toThrow(ResendEntryInvalidError);
  });

  it('throws ResendEntryInvalidError when resend contact is a duplicate (not representative)', async () => {
    const contacts: MockContact[] = [
      { id: 'c1', name: 'Alice', email: 'shared@test.com', user_id: 'user-1', contact_field_values: [] },
      { id: 'c2', name: 'Alice2', email: 'shared@test.com', user_id: 'user-1', contact_field_values: [] },
    ];
    const db = makeMockDb({ contacts, template });

    await expect(
      computeEligibility(db, {
        ...baseInput,
        contactIds: ['c1', 'c2'],
        resendRecipients: [{ contactId: 'c2', recipientEmail: 'shared@test.com' }],
      })
    ).rejects.toThrow(ResendEntryInvalidError);
  });

  it('throws ResendEntryInvalidError with invalidEntries details', async () => {
    const contacts: MockContact[] = [
      { id: 'c1', name: 'Alice', email: 'alice@test.com', user_id: 'user-1', contact_field_values: [] },
    ];
    const db = makeMockDb({ contacts, template });

    try {
      await computeEligibility(db, {
        ...baseInput,
        contactIds: ['c1'],
        resendRecipients: [{ contactId: 'c-not-selected', recipientEmail: 'other@test.com' }],
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResendEntryInvalidError);
      expect((err as ResendEntryInvalidError).code).toBe('RESEND_ENTRY_INVALID');
      expect((err as ResendEntryInvalidError).details).toBeDefined();
    }
  });

  it('accepts valid resend entries (representative contact with prior SENT)', async () => {
    const contacts: MockContact[] = [
      { id: 'c1', name: 'Alice', email: 'alice@test.com', user_id: 'user-1', contact_field_values: [] },
    ];
    const db = makeMockDb({
      contacts,
      template,
      historyRows: [
        { normalized_email: 'alice@test.com', status: 'SENT', sent_at: new Date('2026-01-01'), scheduled_at: null, id: 'job-sent-1' },
      ],
    });

    const result = await computeEligibility(db, {
      ...baseInput,
      contactIds: ['c1'],
      resendRecipients: [{ contactId: 'c1', recipientEmail: 'alice@test.com' }],
    });

    expect(result.validatedResendRecipients).toHaveLength(1);
    expect(result.validatedResendRecipients[0].contactId).toBe('c1');
  });
});

describe('computeEligibility — followUpSentJobIds collection (Fix #3)', () => {
  const template: MockTemplate = {
    id: 'template-1',
    subject: 'Hello {{name}}',
    body: 'Body',
    body_text: 'Body',
    body_html: null,
  };

  it('returns followUpSentJobIds with SENT job IDs for follow-up recipients', async () => {
    const contacts: MockContact[] = [
      { id: 'c1', name: 'Alice', email: 'alice@test.com', user_id: 'user-1', contact_field_values: [] },
    ];
    const db = makeMockDb({
      contacts,
      template,
      historyRows: [
        { normalized_email: 'alice@test.com', status: 'SENT', sent_at: new Date('2026-01-01'), scheduled_at: null, id: 'job-sent-1' },
        { normalized_email: 'alice@test.com', status: 'SENT', sent_at: new Date('2026-02-01'), scheduled_at: null, id: 'job-sent-2' },
      ],
    });

    const result = await computeEligibility(db, {
      ...baseInput,
      contactIds: ['c1'],
      resendRecipients: [{ contactId: 'c1', recipientEmail: 'alice@test.com' }],
    });

    expect(result.followUpSentJobIds).toContain('job-sent-1');
    expect(result.followUpSentJobIds).toContain('job-sent-2');
  });

  it('returns empty followUpSentJobIds when no follow-up recipients are specified', async () => {
    const contacts: MockContact[] = [
      { id: 'c1', name: 'Alice', email: 'alice@test.com', user_id: 'user-1', contact_field_values: [] },
    ];
    const db = makeMockDb({
      contacts,
      template,
      historyRows: [
        { normalized_email: 'alice@test.com', status: 'SENT', sent_at: new Date('2026-01-01'), scheduled_at: null, id: 'job-sent-1' },
      ],
    });

    const result = await computeEligibility(db, {
      ...baseInput,
      contactIds: ['c1'],
      resendRecipients: [],
    });

    expect(result.followUpSentJobIds).toEqual([]);
  });

  it('returns empty followUpSentJobIds when follow-up recipient has no SENT history', async () => {
    const contacts: MockContact[] = [
      { id: 'c1', name: 'Alice', email: 'alice@test.com', user_id: 'user-1', contact_field_values: [] },
    ];
    const db = makeMockDb({
      contacts,
      template,
      historyRows: [],
    });

    const result = await computeEligibility(db, {
      ...baseInput,
      contactIds: ['c1'],
      resendRecipients: [{ contactId: 'c1', recipientEmail: 'alice@test.com' }],
    });

    expect(result.followUpSentJobIds).toEqual([]);
  });

  it('collects followUpSentJobIds from multiple follow-up recipients', async () => {
    const contacts: MockContact[] = [
      { id: 'c1', name: 'Alice', email: 'alice@test.com', user_id: 'user-1', contact_field_values: [] },
      { id: 'c2', name: 'Bob', email: 'bob@test.com', user_id: 'user-1', contact_field_values: [] },
    ];
    const db = makeMockDb({
      contacts,
      template,
      historyRows: [
        { normalized_email: 'alice@test.com', status: 'SENT', sent_at: new Date('2026-01-01'), scheduled_at: null, id: 'job-alice' },
        { normalized_email: 'bob@test.com', status: 'SENT', sent_at: new Date('2026-01-02'), scheduled_at: null, id: 'job-bob' },
      ],
    });

    const result = await computeEligibility(db, {
      ...baseInput,
      contactIds: ['c1', 'c2'],
      resendRecipients: [
        { contactId: 'c1', recipientEmail: 'alice@test.com' },
        { contactId: 'c2', recipientEmail: 'bob@test.com' },
      ],
    });

    expect(result.followUpSentJobIds).toContain('job-alice');
    expect(result.followUpSentJobIds).toContain('job-bob');
  });
});
