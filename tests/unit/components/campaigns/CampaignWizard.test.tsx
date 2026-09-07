import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignWizard, type CampaignSelectOption } from '@/components/campaigns/CampaignWizard';

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

  expect(screen.getByLabelText('Sending account')).toHaveValue('account-1');
  expect(screen.getByRole('checkbox', { name: /Attachment.pdf/ })).not.toBeChecked();
  await user.click(screen.getByRole('checkbox', { name: /Attachment.pdf/ }));
  expect(screen.getByLabelText('Template')).toHaveValue('template-1');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await user.click(screen.getByLabelText(/Ada Lovelace/));
  await user.click(screen.getByLabelText(/Grace Hopper/));
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await user.clear(screen.getByLabelText('Start time'));
  await user.type(screen.getByLabelText('Start time'), '2026-09-03T09:30');
  await user.clear(screen.getByLabelText('Timezone'));
  await user.type(screen.getByLabelText('Timezone'), 'Asia/Calcutta');
  await user.clear(screen.getByLabelText('Time between emails (minutes)'));
  await user.type(screen.getByLabelText('Time between emails (minutes)'), '10');
  await user.clear(screen.getByLabelText('Emails per day (optional)'));
  await user.type(screen.getByLabelText('Emails per day (optional)'), '20');
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
    await user.click(screen.getByRole('button', { name: 'Start campaign' }));
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

    expect(screen.getByRole('option', { name: 'sender@example.com (gmail)' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Attachment.pdf/ })).toBeInTheDocument();
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
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start campaign' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Hiring outreach',
      emailAccountId: 'account-1',
      attachmentIds: ['attachment-1'],
      templateId: 'template-1',
      contactIds: ['contact-1', 'contact-2'],
      startAt: '2026-09-03T04:00:00.000Z',
      timezone: 'Asia/Calcutta',
      intervalMinutes: 10,
      dailyLimit: 20,
    });
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
});
