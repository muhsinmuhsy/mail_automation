import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignForm } from '@/components/campaigns/CampaignForm';

const options = {
  emailAccounts: [{ id: 'account-1', label: 'sender@example.com (gmail)' }],
  attachments: [{ id: 'attachment-1', label: 'Attachment.pdf' }],
  templates: [{ id: 'template-1', label: 'Follow-up' }],
  contacts: [{ id: 'contact-1', label: 'Ada Lovelace', description: 'ada@example.com' }],
};

describe('CampaignForm', () => {
  it('renders the plan-compliant guided campaign form', () => {
    render(<CampaignForm {...options} onSubmit={vi.fn()} />);

    expect(screen.getByText('01 Campaign')).toBeInTheDocument();
    expect(screen.getByText('05 Review')).toBeInTheDocument();
    expect(screen.getByLabelText('Campaign name')).toBeInTheDocument();
  });

  it('passes real selected campaign data through to onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CampaignForm {...options} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Campaign name'), 'Wrapped campaign');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText(/Ada Lovelace/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Start campaign' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wrapped campaign',
        emailAccountId: 'account-1',
        attachmentId: 'attachment-1',
        templateId: 'template-1',
        contactIds: ['contact-1'],
      })
    );
  });

  it('forwards the loading state', () => {
    render(<CampaignForm loading onSubmit={vi.fn()} />);

    expect(screen.getByText('Loading campaign options...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
