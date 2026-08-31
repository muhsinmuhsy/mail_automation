import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignForm } from '@/components/campaigns/CampaignForm';

describe('CampaignForm', () => {
  it('renders the campaign name input with its label', () => {
    render(<CampaignForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Campaign name')).toBeInTheDocument();
  });

  it('renders the three selects', () => {
    render(<CampaignForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Sending account')).toBeInTheDocument();
    expect(screen.getByLabelText('Resume')).toBeInTheDocument();
    expect(screen.getByLabelText('Template')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });

  it('renders selects with no options (data not wired up yet)', () => {
    render(<CampaignForm onSubmit={vi.fn()} />);
    for (const select of screen.getAllByRole('combobox')) {
      expect(select.querySelectorAll('option')).toHaveLength(0);
    }
  });

  it('marks the campaign name as required', () => {
    render(<CampaignForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Campaign name')).toBeRequired();
  });

  it('renders a submit button', () => {
    render(<CampaignForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Create campaign' })).toHaveAttribute(
      'type',
      'submit'
    );
  });

  it('starts with an empty name', () => {
    render(<CampaignForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Campaign name')).toHaveValue('');
  });

  it('updates the name as the user types', async () => {
    const user = userEvent.setup();
    render(<CampaignForm onSubmit={vi.fn()} />);
    const input = screen.getByLabelText('Campaign name');
    await user.type(input, 'Summer push');
    expect(input).toHaveValue('Summer push');
  });

  it('submits the typed name with empty relation ids', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Outreach Q3');
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Outreach Q3',
      emailAccountId: '',
      resumeId: '',
      templateId: '',
    });
  });

  it('submits an empty name when nothing is typed', () => {
    const onSubmit = vi.fn();
    const { container } = render(<CampaignForm onSubmit={onSubmit} />);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledWith({
      name: '',
      emailAccountId: '',
      resumeId: '',
      templateId: '',
    });
  });

  it('prevents the browser default submission', () => {
    const { container } = render(<CampaignForm onSubmit={vi.fn()} />);
    expect(fireEvent.submit(container.querySelector('form') as HTMLFormElement)).toBe(false);
  });

  it('can be submitted repeatedly with updated values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Campaign name');
    await user.type(input, 'One');
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));
    await user.clear(input);
    await user.type(input, 'Two');
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[0][0].name).toBe('One');
    expect(onSubmit.mock.calls[1][0].name).toBe('Two');
  });

  it('does not clear the name after a submit', async () => {
    const user = userEvent.setup();
    render(<CampaignForm onSubmit={vi.fn()} />);
    const input = screen.getByLabelText('Campaign name');
    await user.type(input, 'Keeps value');
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));
    expect(input).toHaveValue('Keeps value');
  });

  it('submits when Enter is pressed inside the name field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Campaign name'), 'Enter campaign{Enter}');
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Enter campaign' })
    );
  });

  it('stacks fields in a vertical flex column', () => {
    const { container } = render(<CampaignForm onSubmit={vi.fn()} />);
    expect(container.querySelector('form')).toHaveClass('flex', 'flex-col', 'gap-4');
  });
});
