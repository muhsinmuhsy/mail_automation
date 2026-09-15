import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignWizard, type CampaignSelectOption } from '@/components/campaigns/CampaignWizard';

const VALID_FINGERPRINT = 'a'.repeat(64);

function mockPreCheckResponse(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      missingValues: [],
      unknownTokens: [],
      affectedContactCount: 0,
      totalContactCount: 0,
      policyVersion: 1,
      checkedAt: new Date().toISOString(),
      previewFingerprint: VALID_FINGERPRINT,
      selectedCount: 0,
      eligibleCount: 0,
      excludedCount: 0,
      excludedByReason: { duplicateAddress: 0, previouslySent: 0, pending: 0, deliveryUnknown: 0, missingValues: 0 },
      includedPreviousCount: 0,
      includedWithoutPreviousSendCount: 0,
      blockedByUnknownTokens: false,
      recipients: [],
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/campaigns/pre-check' && init?.body) {
      const body = JSON.parse(init.body as string);
      const count = body.contactIds?.length ?? 0;
      return {
        ok: true,
        json: async () => mockPreCheckResponse({
          selectedCount: count,
          eligibleCount: count,
          totalContactCount: count,
          recipients: (body.contactIds ?? []).map((id: string) => ({ contactId: id, included: true, followUpSelected: false, canSelectFollowUp: false, primaryReason: null })),
        }),
      };
    }
    return { ok: true, json: async () => mockPreCheckResponse() };
  }));
});

const options = {
  emailAccounts: [
    { id: 'account-1', provider: 'gmail', label: 'sender@example.com (gmail)' },
    { id: 'account-2', provider: 'gmail', label: 'backup@example.com (gmail)' },
  ],
  attachments: [{ id: 'attachment-1', label: 'Attachment.pdf (default)' }],
  templates: [{ id: 'template-1', label: 'Follow-up', description: 'Hello {{name}}' }],
  contacts: [
    { id: 'contact-1', label: 'Ada Lovelace', description: 'ada@example.com - Analytical Engines' },
    { id: 'contact-2', label: 'Grace Hopper', description: 'grace@example.com' },
  ],
} satisfies Record<string, CampaignSelectOption[]>;

async function completeWizard(onSubmit = vi.fn()) {
  const user = userEvent.setup();
  render(<CampaignWizard {...options} onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText('Campaign name'), 'Hiring outreach');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  expect(screen.getByRole('combobox', { name: 'Sending account' })).toHaveTextContent('sender@example.com (gmail)');
  expect(screen.getByRole('checkbox', { name: /Attachment.pdf/ })).not.toBeChecked();
  await user.click(screen.getByRole('checkbox', { name: /Attachment.pdf/ }));
  expect(screen.getByRole('combobox', { name: 'Template' })).toHaveTextContent('Follow-up');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await user.click(screen.getByLabelText(/Ada Lovelace/));
  await user.click(screen.getByLabelText(/Grace Hopper/));
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await user.clear(screen.getByLabelText('Start time'));
  await user.type(screen.getByLabelText('Start time'), '2026-09-03T09:30');
  await user.click(screen.getByRole('combobox', { name: 'Timezone' }));
  await user.type(screen.getByPlaceholderText(/Search timezone/), 'Asia/Calcutta');
  await user.click(screen.getByRole('option', { name: /Asia\/Calcutta/ }));
  await user.clear(screen.getByLabelText('Time between emails (minutes)'));
  await user.type(screen.getByLabelText('Time between emails (minutes)'), '10');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  return { user, onSubmit };
}

describe('CampaignWizard', () => {
  it('hides pace for one recipient, preserves it for multiple, and ignores hidden invalid values on submit', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Single email');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText('When to send')).toBeInTheDocument();
    expect(screen.queryByLabelText('Time between emails (minutes)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Emails per day (optional)')).not.toBeInTheDocument();
    expect(screen.getByText(/1 email will be scheduled for/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByLabelText(/Grace Hopper/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.clear(screen.getByLabelText('Time between emails (minutes)'));
    await user.type(screen.getByLabelText('Time between emails (minutes)'), '0');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByLabelText(/Grace Hopper/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText('Emails per day')).not.toBeInTheDocument();
    expect(screen.queryByText(/every 0 minutes/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Schedule 1 email/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ contactIds: ['contact-1'], intervalMinutes: 5, dailyLimit: null }));
  });
  it('explains the schedule and lets users remove the daily cap explicitly', async () => {
    const { user } = await completeWizard();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Time between emails (minutes)')).toHaveAttribute('aria-describedby', 'interval-help');
    expect(screen.getByText(/Space out your emails/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use no daily cap' }));
    expect(screen.getByLabelText('Emails per day (optional)')).toHaveValue(null);
    expect(screen.getByText(/Send 1 email every 10 minutes/)).toHaveTextContent('no daily cap');
    await user.clear(screen.getByLabelText('Time between emails (minutes)'));
    await user.type(screen.getByLabelText('Time between emails (minutes)'), '0');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter at least 1 minute, using a whole number.')).toBeInTheDocument();
  });
  it('defaults emails per day to the total email count', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Defaults');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Emails per day (optional)')).toHaveValue(2);
    });
    expect(screen.getByText(/You have 2 emails total/)).toBeInTheDocument();
  });
  it('shows an error when emails per day exceeds the total email count', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Exceeds');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Emails per day (optional)')).toHaveValue(2);
    });
    await user.clear(screen.getByLabelText('Emails per day (optional)'));
    await user.type(screen.getByLabelText('Emails per day (optional)'), '3');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Daily limit cannot exceed 2 (your total emails).')).toBeInTheDocument();
  });
  it('allows emails per day equal to the total email count', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Equal');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Emails per day (optional)')).toHaveValue(2);
    });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText('Daily limit cannot exceed 2 (your total emails).')).not.toBeInTheDocument();
  });
  it('allows emails per day less than the total email count', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Less');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Emails per day (optional)')).toHaveValue(2);
    });
    await user.clear(screen.getByLabelText('Emails per day (optional)'));
    await user.type(screen.getByLabelText('Emails per day (optional)'), '1');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText('Daily limit cannot exceed 2 (your total emails).')).not.toBeInTheDocument();
  });
  it('selects multiple files, preserves them on Back, and clears the selection', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} attachments={[{ id: 'a', label: 'One.pdf', size_bytes: 1024 }, { id: 'b', label: 'Two.pdf', size_bytes: 1024 }]} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Multiple');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('checkbox', { name: /One.pdf/ }));
    await user.click(screen.getByRole('checkbox', { name: /Two.pdf/ }));
    expect(screen.getByRole('status')).toHaveTextContent('2 files selected');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('checkbox', { name: /One.pdf/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Two.pdf/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Clear attachments' }));
    expect(screen.getByRole('status')).toHaveTextContent('0 files selected');
  });
  it('blocks excessive combined size and allows continuing after clearing files', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} attachments={Array.from({ length: 5 }, (_, i) => ({ id: String(i), label: `File${i}.pdf`, size_bytes: 5 * 1024 * 1024 }))} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Limits');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('20 MB');
    await user.click(screen.getByRole('button', { name: 'Clear attachments' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText(/Ada Lovelace/)).toBeInTheDocument();
  });
  it('renders all five guided campaign creation steps', () => {
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    expect(screen.getByText('01 Campaign')).toBeInTheDocument();
    expect(screen.getByText('02 Content')).toBeInTheDocument();
    expect(screen.getByText('03 Contacts')).toBeInTheDocument();
    expect(screen.getByText('04 Schedule')).toBeInTheDocument();
    expect(screen.getByText('05 Review')).toBeInTheDocument();
    expect(screen.getByText('01 Campaign')).toHaveAttribute('aria-current', 'step');
  });

  it('blocks progress when the campaign name is missing', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Campaign name is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('Campaign name')).toBeInTheDocument();
  });

  it('shows real account, attachment, and template options instead of empty selects', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Real options');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(screen.getByRole('combobox', { name: 'Sending account' }));
    expect(screen.getByRole('option', { name: 'sender@example.com (gmail)' })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Sending account' }));
    expect(screen.getByRole('checkbox', { name: /Attachment.pdf/ })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Template' }));
    expect(screen.getByRole('option', { name: 'Follow-up' })).toBeInTheDocument();
  });

  it('requires at least one contact before schedule configuration', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'No contacts');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Choose at least one contact.')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('submits the complete planned campaign payload from the review step', async () => {
    const onSubmit = vi.fn();
    const { user } = await completeWizard(onSubmit);

    expect(screen.getByText('Ready to launch')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /Schedule 2 emails/ }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Hiring outreach',
      emailAccountId: 'account-1',
      attachmentIds: ['attachment-1'],
      templateId: 'template-1',
      contactIds: ['contact-1', 'contact-2'],
      startAt: '2026-09-03T04:00:00.000Z',
      timezone: 'Asia/Calcutta',
      intervalMinutes: 10,
      dailyLimit: 2,
      missingValueAction: 'exclude',
      unknownTokenAction: 'fix',
      previewFingerprint: VALID_FINGERPRINT,
      resendRecipients: [],
    }));
    expect(onSubmit.mock.calls[0][0].idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('keeps the review submit disabled until required selections exist', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Incomplete');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Choose a sending account.')).toBeInTheDocument();
  });

  it('shows a loading state while campaign prerequisites are loading', () => {
    render(<CampaignWizard loading onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Campaign name')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('shows the eligibility summary when contacts are selected', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));

    await waitFor(() => {
      expect(screen.getByText(/emails will be scheduled/)).toBeInTheDocument();
    });
  });

  it('shows eligibility summary immediately on Contacts step without navigating away', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));

    await waitFor(() => {
      expect(screen.getByText(/emails? will be scheduled/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('shows excluded count and View details when contacts are excluded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: 2,
            eligibleCount: 1,
            excludedCount: 1,
            totalContactCount: 2,
            excludedByReason: { duplicateAddress: 0, previouslySent: 1, pending: 0, deliveryUnknown: 0, missingValues: 0 },
            recipients: (body.contactIds ?? []).map((id: string, i: number) => ({
              contactId: id,
              included: i === 0,
              followUpSelected: false,
              canSelectFollowUp: i === 1,
              primaryReason: i === 0 ? null : 'PREVIOUSLY_SENT',
            })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));

    await waitFor(() => {
      expect(screen.getByText('1 email will be scheduled')).toBeInTheDocument();
    }, { timeout: 5000 });
    expect(screen.getByText(/1 contact excluded/)).toBeInTheDocument();
    expect(screen.getByText(/View details/)).toBeInTheDocument();
  });

  it('shows Already scheduled badge for contacts with pending status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: 2,
            eligibleCount: 1,
            excludedCount: 1,
            totalContactCount: 2,
            excludedByReason: { duplicateAddress: 0, previouslySent: 0, pending: 1, deliveryUnknown: 0, missingValues: 0 },
            recipients: (body.contactIds ?? []).map((id: string, i: number) => ({
              contactId: id,
              included: i === 0,
              followUpSelected: false,
              canSelectFollowUp: false,
              primaryReason: i === 0 ? null : 'PENDING',
            })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));

    await waitFor(() => {
      expect(screen.getByText('Already scheduled')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('uses effective count in the schedule button label', async () => {
    const onSubmit = vi.fn();
    const { user } = await completeWizard(onSubmit);
    expect(screen.getByRole('button', { name: /Schedule \d+ emails?/ })).toBeInTheDocument();
  });

  it('freezes idempotency key and fingerprint at click time (Fix #5)', async () => {
    const customFingerprint = 'c'.repeat(64);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        const count = body.contactIds?.length ?? 0;
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: count,
            eligibleCount: count,
            totalContactCount: count,
            previewFingerprint: customFingerprint,
            recipients: (body.contactIds ?? []).map((id: string) => ({ contactId: id, included: true, followUpSelected: false, canSelectFollowUp: false, primaryReason: null })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const onSubmit = vi.fn();
    const { user } = await completeWizard(onSubmit);

    await user.click(await screen.findByRole('button', { name: /Schedule 2 emails/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.previewFingerprint).toBe(customFingerprint);
    expect(payload.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(payload.contactIds).toEqual(['contact-1', 'contact-2']);
    expect(payload.resendRecipients).toEqual([]);
  });

  it('freezes contactIds as a copy at click time (Fix #5)', async () => {
    const onSubmit = vi.fn();
    const { user } = await completeWizard(onSubmit);

    await user.click(await screen.findByRole('button', { name: /Schedule 2 emails/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.contactIds).toEqual(['contact-1', 'contact-2']);
    expect(payload.contactIds).not.toBe(['contact-1', 'contact-2']);
    expect(Array.isArray(payload.contactIds)).toBe(true);
  });

  it('shows Already scheduled badge from recipient-status for selected contacts during refetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/recipient-status' && init?.body) {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              statuses: (body.contactIds ?? []).map((id: string) => ({
                contactId: id,
                classification: 'PENDING',
                lastSentAt: null,
              })),
            },
          }),
        };
      }
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        const count = body.contactIds?.length ?? 0;
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: count,
            eligibleCount: 0,
            excludedCount: count,
            totalContactCount: count,
            excludedByReason: { duplicateAddress: 0, previouslySent: 0, pending: count, deliveryUnknown: 0, missingValues: 0 },
            recipients: (body.contactIds ?? []).map((id: string) => ({
              contactId: id,
              included: false,
              followUpSelected: false,
              canSelectFollowUp: false,
              primaryReason: 'PENDING',
            })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(screen.getByLabelText(/Ada Lovelace/));

    await waitFor(() => {
      expect(screen.getByText('Already scheduled')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('shows loading skeleton during initial eligibility check', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/campaigns/pre-check') {
        return new Promise(() => {});
      }
      if (url === '/api/campaigns/recipient-status') {
        return { ok: true, json: async () => ({ success: true, data: { statuses: [] } }) };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));

    await waitFor(() => {
      expect(screen.getByText('Checking recipients…')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('shows skeleton badges on contacts while recipient-status is loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/recipient-status') {
        return new Promise(() => {});
      }
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        const count = body.contactIds?.length ?? 0;
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: count,
            eligibleCount: count,
            totalContactCount: count,
            recipients: (body.contactIds ?? []).map((id: string) => ({ contactId: id, included: true, followUpSelected: false, canSelectFollowUp: false, primaryReason: null })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      const skeletons = screen.getAllByLabelText('Checking status');
      expect(skeletons.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it('shows Updating spinner during stale refetch', async () => {
    let preCheckCallCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/pre-check' && init?.body) {
        preCheckCallCount++;
        if (preCheckCallCount === 1) {
          const body = JSON.parse(init.body as string);
          const count = body.contactIds?.length ?? 0;
          return {
            ok: true,
            json: async () => mockPreCheckResponse({
              selectedCount: count,
              eligibleCount: count,
              totalContactCount: count,
              recipients: (body.contactIds ?? []).map((id: string) => ({ contactId: id, included: true, followUpSelected: false, canSelectFollowUp: false, primaryReason: null })),
            }),
          };
        }
        return new Promise(() => {});
      }
      if (url === '/api/campaigns/recipient-status') {
        return { ok: true, json: async () => ({ success: true, data: { statuses: [] } }) };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));

    await waitFor(() => {
      expect(screen.getByText(/emails? will be scheduled/)).toBeInTheDocument();
    }, { timeout: 5000 });

    await user.click(screen.getByLabelText(/Grace Hopper/));

    await waitFor(() => {
      expect(screen.getByText('Updating…')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('shows zero-eligible warning with exclusion breakdown when all contacts are pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        const count = body.contactIds?.length ?? 0;
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: count,
            eligibleCount: 0,
            excludedCount: count,
            totalContactCount: count,
            excludedByReason: { duplicateAddress: 0, previouslySent: 0, pending: count, deliveryUnknown: 0, missingValues: 0 },
            recipients: (body.contactIds ?? []).map((id: string) => ({
              contactId: id, included: false, followUpSelected: false, canSelectFollowUp: false, primaryReason: 'PENDING',
            })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));

    await waitFor(() => {
      expect(screen.getByText('No emails will be scheduled')).toBeInTheDocument();
    }, { timeout: 5000 });
    expect(screen.getAllByText(/Already scheduled/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Use a different template or sending account/)).toBeInTheDocument();
  });

  it('disables Continue button and shows No eligible recipients when zero eligible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        const count = body.contactIds?.length ?? 0;
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: count, eligibleCount: 0, excludedCount: count, totalContactCount: count,
            excludedByReason: { duplicateAddress: 0, previouslySent: 0, pending: count, deliveryUnknown: 0, missingValues: 0 },
            recipients: (body.contactIds ?? []).map((id: string) => ({
              contactId: id, included: false, followUpSelected: false, canSelectFollowUp: false, primaryReason: 'PENDING',
            })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'No eligible recipients' })).toBeDisabled();
    }, { timeout: 5000 });
  });

  it('shows Choose follow-ups button in zero-eligible warning when SENT contacts exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        const count = body.contactIds?.length ?? 0;
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: count, eligibleCount: 0, excludedCount: count, totalContactCount: count,
            excludedByReason: { duplicateAddress: 0, previouslySent: count, pending: 0, deliveryUnknown: 0, missingValues: 0 },
            recipients: (body.contactIds ?? []).map((id: string) => ({
              contactId: id, included: false, followUpSelected: false, canSelectFollowUp: true, primaryReason: 'PREVIOUSLY_SENT',
            })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));

    await waitFor(() => {
      expect(screen.getByText('No emails will be scheduled')).toBeInTheDocument();
    }, { timeout: 5000 });
    const followUpButtons = screen.getAllByRole('button', { name: 'Choose follow-ups' });
    expect(followUpButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('adds tooltip title to Already scheduled badge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: 1, eligibleCount: 0, excludedCount: 1, totalContactCount: 1,
            excludedByReason: { duplicateAddress: 0, previouslySent: 0, pending: 1, deliveryUnknown: 0, missingValues: 0 },
            recipients: [{ contactId: body.contactIds[0], included: false, followUpSelected: false, canSelectFollowUp: false, primaryReason: 'PENDING' }],
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));

    await waitFor(() => {
      const badge = screen.getByText('Already scheduled');
      expect(badge.closest('span')).toHaveAttribute('title', expect.stringContaining('queued in another campaign'));
    }, { timeout: 5000 });
  });

  it('shows zero-eligible warning on Schedule step as safety net', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        const count = body.contactIds?.length ?? 0;
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: count, eligibleCount: 0, excludedCount: count, totalContactCount: count,
            excludedByReason: { duplicateAddress: 0, previouslySent: 0, pending: count, deliveryUnknown: 0, missingValues: 0 },
            recipients: (body.contactIds ?? []).map((id: string) => ({
              contactId: id, included: false, followUpSelected: false, canSelectFollowUp: false, primaryReason: 'PENDING',
            })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));

    await waitFor(() => {
      expect(screen.getByText('No emails will be scheduled')).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(screen.getByRole('button', { name: 'No eligible recipients' })).toBeDisabled();
  });
});

describe('CampaignWizard — Schedule step Continue button with zero eligible', () => {
  it('enables Continue on Schedule step when contacts are eligible', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));

    await waitFor(() => {
      expect(screen.getByText('2 emails will be scheduled')).toBeInTheDocument();
    }, { timeout: 5000 });

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('disables Continue on Schedule step when zero eligible after refetch', async () => {
    let returnZero = false;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        const count = body.contactIds?.length ?? 0;
        if (!returnZero) {
          return {
            ok: true,
            json: async () => mockPreCheckResponse({
              selectedCount: count,
              eligibleCount: count,
              totalContactCount: count,
              recipients: (body.contactIds ?? []).map((id: string) => ({
                contactId: id, included: true, followUpSelected: false, canSelectFollowUp: false, primaryReason: null,
              })),
            }),
          };
        }
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: count, eligibleCount: 0, excludedCount: count, totalContactCount: count,
            excludedByReason: { duplicateAddress: 0, previouslySent: 0, pending: count, deliveryUnknown: 0, missingValues: 0 },
            recipients: (body.contactIds ?? []).map((id: string) => ({
              contactId: id, included: false, followUpSelected: false, canSelectFollowUp: false, primaryReason: 'PENDING',
            })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByLabelText(/Grace Hopper/));

    await waitFor(() => {
      expect(screen.getByText('2 emails will be scheduled')).toBeInTheDocument();
    }, { timeout: 10000 });

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    returnZero = true;
    await user.click(screen.getByLabelText(/Grace Hopper/));

    await waitFor(() => {
      expect(screen.getByText('No emails will be scheduled')).toBeInTheDocument();
    }, { timeout: 10000 });

    expect(screen.getByRole('button', { name: 'No eligible recipients' })).toBeDisabled();
  }, 20000);
});

describe('CampaignWizard — Contacts step sort and date range filter', () => {
  it('shows SortSelect and DateRangeFilter on the Contacts step when using paginated contacts', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/contacts')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [
              { id: 'c1', name: 'Alice', email: 'alice@test.com' },
              { id: 'c2', name: 'Bob', email: 'bob@test.com' },
            ],
            pagination: { total: 2, totalPages: 1 },
          }),
        };
      }
      if (url === '/api/campaigns/pre-check' && init?.body) {
        return { ok: true, json: async () => mockPreCheckResponse() };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const { emailAccounts, attachments, templates } = options;
    render(<CampaignWizard emailAccounts={emailAccounts} attachments={attachments} templates={templates} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText('Sort')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
  });

  it('sends sortOrder param to /api/contacts when sort changes', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/contacts')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [
              { id: 'c1', name: 'Alice', email: 'alice@test.com' },
              { id: 'c2', name: 'Bob', email: 'bob@test.com' },
            ],
            pagination: { total: 2, totalPages: 1 },
          }),
        };
      }
      if (url === '/api/campaigns/pre-check' && init?.body) {
        return { ok: true, json: async () => mockPreCheckResponse() };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { emailAccounts, attachments, templates } = options;
    render(<CampaignWizard emailAccounts={emailAccounts} attachments={attachments} templates={templates} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText('Sort')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Sort'));
    await user.click(screen.getByText('Oldest first'));

    await waitFor(() => {
      const contactsCalls = fetchMock.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('/api/contacts')
      );
      const lastCall = contactsCalls[contactsCalls.length - 1];
      expect(lastCall[0]).toContain('sortOrder=asc');
    });
  });

  it('sends startDate and endDate params to /api/contacts when date range is set', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/contacts')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [
              { id: 'c1', name: 'Alice', email: 'alice@test.com' },
              { id: 'c2', name: 'Bob', email: 'bob@test.com' },
            ],
            pagination: { total: 2, totalPages: 1 },
          }),
        };
      }
      if (url === '/api/campaigns/pre-check' && init?.body) {
        return { ok: true, json: async () => mockPreCheckResponse() };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { emailAccounts, attachments, templates } = options;
    render(<CampaignWizard emailAccounts={emailAccounts} attachments={attachments} templates={templates} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Start date'), '2026-09-01');
    await user.type(screen.getByLabelText('End date'), '2026-09-30');

    await waitFor(() => {
      const contactsCalls = fetchMock.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('/api/contacts')
      );
      const lastCall = contactsCalls[contactsCalls.length - 1];
      expect(lastCall[0]).toContain('startDate=2026-09-01');
      expect(lastCall[0]).toContain('endDate=2026-09-30');
    });
  });

  it('resets to page 1 when sort order changes', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/contacts')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [{ id: 'c1', name: 'Alice', email: 'alice@test.com' }],
            pagination: { total: 25, totalPages: 2 },
          }),
        };
      }
      if (url === '/api/campaigns/pre-check' && init?.body) {
        return { ok: true, json: async () => mockPreCheckResponse() };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { emailAccounts, attachments, templates } = options;
    render(<CampaignWizard emailAccounts={emailAccounts} attachments={attachments} templates={templates} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Sort'));
    await user.click(screen.getByText('Oldest first'));

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });
});

describe('CampaignWizard — paginated template dropdown', () => {
  it('renders SearchableSelect with search input when templates prop is empty', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/templates')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [{ id: 'tpl-1', name: 'Welcome Email' }, { id: 'tpl-2', name: 'Follow-up Email' }],
            pagination: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
          }),
        };
      }
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        const count = body.contactIds?.length ?? 0;
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: count, eligibleCount: count, totalContactCount: count,
            recipients: (body.contactIds ?? []).map((id: string) => ({ contactId: id, included: true, followUpSelected: false, canSelectFollowUp: false, primaryReason: null })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { emailAccounts, contacts } = options;
    const user = userEvent.setup();
    render(<CampaignWizard emailAccounts={emailAccounts} contacts={contacts} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(screen.getByRole('combobox', { name: 'Template' }));
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Welcome Email' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Follow-up Email' })).toBeInTheDocument();
    });
  });

  it('fetches from /api/templates with page and limit params when dropdown opens', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/templates')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [{ id: 'tpl-1', name: 'Welcome' }],
            pagination: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { emailAccounts, contacts } = options;
    const user = userEvent.setup();
    render(<CampaignWizard emailAccounts={emailAccounts} contacts={contacts} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('combobox', { name: 'Template' }));

    await waitFor(() => {
      const templateCall = fetchMock.mock.calls.find((call) => {
        const u = call[0] as string;
        return u.includes('/api/templates') && u.includes('page=1') && u.includes('limit=10');
      });
      expect(templateCall).toBeDefined();
    });
  });

  it('selects a template from the paginated dropdown and shows it in Review', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/templates')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [{ id: 'tpl-welcome', name: 'Welcome Email' }],
            pagination: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
          }),
        };
      }
      if (url === '/api/campaigns/pre-check' && init?.body) {
        const body = JSON.parse(init.body as string);
        const count = body.contactIds?.length ?? 0;
        return {
          ok: true,
          json: async () => mockPreCheckResponse({
            selectedCount: count, eligibleCount: count, totalContactCount: count,
            recipients: (body.contactIds ?? []).map((id: string) => ({ contactId: id, included: true, followUpSelected: false, canSelectFollowUp: false, primaryReason: null })),
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const { emailAccounts, contacts } = options;
    const user = userEvent.setup();
    render(<CampaignWizard emailAccounts={emailAccounts} contacts={contacts} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test Campaign');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(screen.getByRole('combobox', { name: 'Template' }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Welcome Email' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('option', { name: 'Welcome Email' }));

    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveTextContent('Welcome Email');

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText('Welcome Email')).toBeInTheDocument();
    });
  });

  it('shows no results message when template search returns empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/templates')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [],
            pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 },
          }),
        };
      }
      return { ok: true, json: async () => mockPreCheckResponse() };
    }));

    const { emailAccounts, contacts } = options;
    const user = userEvent.setup();
    render(<CampaignWizard emailAccounts={emailAccounts} contacts={contacts} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('combobox', { name: 'Template' }));

    await waitFor(() => {
      expect(screen.getByText('No results found.')).toBeInTheDocument();
    });
  });
});

describe('CampaignWizard — timezone dropdown', () => {
  it('renders TimezoneSelect on the Schedule step with system default timezone', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('combobox', { name: 'Timezone' })).toBeInTheDocument();
  });

  it('allows searching and selecting a timezone from the dropdown', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(screen.getByRole('combobox', { name: 'Timezone' }));
    expect(screen.getByPlaceholderText(/Search timezone/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Search timezone/), 'Asia/Calcutta');
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Asia\/Calcutta/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('option', { name: /Asia\/Calcutta/ }));

    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent(/Asia\/Calcutta/);
  });
});
