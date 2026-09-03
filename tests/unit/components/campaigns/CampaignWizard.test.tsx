import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignWizard, type CampaignSelectOption } from '@/components/campaigns/CampaignWizard';

const options = {
  emailAccounts: [
    { id: 'account-1', label: 'sender@example.com (gmail)' },
    { id: 'account-2', label: 'backup@example.com (gmail)' },
  ],
  resumes: [{ id: 'resume-1', label: 'Resume.pdf (default)' }],
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
  expect(screen.getByLabelText('Resume')).toHaveValue('resume-1');
  expect(screen.getByLabelText('Template')).toHaveValue('template-1');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await user.click(screen.getByLabelText(/Ada Lovelace/));
  await user.click(screen.getByLabelText(/Grace Hopper/));
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await user.clear(screen.getByLabelText('Start time'));
  await user.type(screen.getByLabelText('Start time'), '2026-09-03T09:30');
  await user.clear(screen.getByLabelText('Timezone'));
  await user.type(screen.getByLabelText('Timezone'), 'Asia/Calcutta');
  await user.clear(screen.getByLabelText('Interval minutes'));
  await user.type(screen.getByLabelText('Interval minutes'), '10');
  await user.clear(screen.getByLabelText('Daily limit'));
  await user.type(screen.getByLabelText('Daily limit'), '20');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  return { user, onSubmit };
}

describe('CampaignWizard', () => {
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

  it('shows real account, resume, and template options instead of empty selects', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard {...options} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Real options');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('option', { name: 'sender@example.com (gmail)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Resume.pdf (default)' })).toBeInTheDocument();
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
      resumeId: 'resume-1',
      templateId: 'template-1',
      contactIds: ['contact-1', 'contact-2'],
      startAt: expect.stringMatching(/^2026-09-03T/),
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

    expect(screen.getByText('Loading campaign options...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
