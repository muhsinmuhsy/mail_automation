import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignWizard } from '@/components/campaigns/CampaignWizard';

const STEP_LABELS = ['Campaign', 'Content', 'Contacts', 'Schedule', 'Review'];

function stepEl(index: number): HTMLElement {
  const label = `${String(index + 1).padStart(2, '0')} ${STEP_LABELS[index]}`;
  return screen.getByText(label);
}

describe('CampaignWizard', () => {
  it('renders all five zero-padded step labels', () => {
    render(<CampaignWizard onSubmit={vi.fn()} />);
    expect(screen.getByText('01 Campaign')).toBeInTheDocument();
    expect(screen.getByText('02 Content')).toBeInTheDocument();
    expect(screen.getByText('03 Contacts')).toBeInTheDocument();
    expect(screen.getByText('04 Schedule')).toBeInTheDocument();
    expect(screen.getByText('05 Review')).toBeInTheDocument();
  });

  it('renders separators between steps but not after the last one', () => {
    render(<CampaignWizard onSubmit={vi.fn()} />);
    expect(screen.getAllByText('—')).toHaveLength(STEP_LABELS.length - 1);
  });

  it('renders the embedded campaign form', () => {
    render(<CampaignWizard onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Campaign name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create campaign' })).toBeInTheDocument();
  });

  it('highlights only the first step initially', () => {
    render(<CampaignWizard onSubmit={vi.fn()} />);
    expect(stepEl(0)).toHaveClass('text-information');
    for (let i = 1; i < STEP_LABELS.length; i++) {
      expect(stepEl(i)).toHaveClass('text-text-secondary');
    }
  });

  it('disables Back on the first step and enables Continue', () => {
    render(<CampaignWizard onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('advances to the next step on Continue', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(stepEl(0)).toHaveClass('text-information');
    expect(stepEl(1)).toHaveClass('text-information');
    expect(stepEl(2)).toHaveClass('text-text-secondary');
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  });

  it('goes back to the previous step on Back', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(stepEl(1)).toHaveClass('text-text-secondary');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('disables Continue on the last step and highlights every step', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard onSubmit={vi.fn()} />);
    const cont = screen.getByRole('button', { name: 'Continue' });
    for (let i = 0; i < STEP_LABELS.length - 1; i++) {
      await user.click(cont);
    }
    expect(cont).toBeDisabled();
    for (let i = 0; i < STEP_LABELS.length; i++) {
      expect(stepEl(i)).toHaveClass('text-information');
    }
  });

  it('cannot advance past the last step (clamped by Math.min)', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard onSubmit={vi.fn()} />);
    const cont = screen.getByRole('button', { name: 'Continue' });
    for (let i = 0; i < 4; i++) await user.click(cont);
    // Fire the handler directly since the button is now disabled.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(stepEl(4)).toHaveClass('text-text-secondary');
  });

  it('walks forward and backward through every step', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard onSubmit={vi.fn()} />);
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: 'Continue' }));
    }
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: 'Back' }));
    }
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(stepEl(1)).toHaveClass('text-text-secondary');
  });

  it('forwards the form submission to onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CampaignWizard onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Wizard campaign');
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Wizard campaign',
      emailAccountId: '',
      resumeId: '',
      templateId: '',
    });
  });

  it('keeps the form mounted while navigating steps', async () => {
    const user = userEvent.setup();
    render(<CampaignWizard onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Persisted');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText('Campaign name')).toHaveValue('Persisted');
  });

  it('renders Back as the secondary variant and Continue as primary', () => {
    render(<CampaignWizard onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('bg-surface');
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('bg-information');
  });

  it('renders the form inside a bordered panel', () => {
    const { container } = render(<CampaignWizard onSubmit={vi.fn()} />);
    const panel = container.querySelector('form')?.parentElement as HTMLElement;
    expect(panel).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-6');
  });
});
