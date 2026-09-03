import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailAccountForm } from '@/components/email-accounts/EmailAccountForm';

describe('EmailAccountForm', () => {
  it('renders the provider select and email input with labels', () => {
    render(<EmailAccountForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Provider')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('renders all five provider options including the placeholder', () => {
    render(<EmailAccountForm onSubmit={vi.fn()} />);
    const select = screen.getByLabelText('Provider') as unknown as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      '',
      'gmail',
      'microsoft',
      'yahoo',
      'custom_smtp',
    ]);
    expect(screen.getByRole('option', { name: 'Select provider' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Gmail' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Microsoft' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Yahoo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Custom SMTP' })).toBeInTheDocument();
  });

  it('defaults to the empty provider and empty email', () => {
    render(<EmailAccountForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Provider')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('uses an email input type', () => {
    render(<EmailAccountForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Provider')).toBeRequired();
  });

  it('renders a Connect submit button', () => {
    render(<EmailAccountForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Connect' })).toHaveAttribute('type', 'submit');
  });

  it('updates the provider when an option is selected', async () => {
    const user = userEvent.setup();
    render(<EmailAccountForm onSubmit={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('Provider'), 'yahoo');
    expect(screen.getByLabelText('Provider')).toHaveValue('yahoo');
  });

  it('updates the email as the user types', async () => {
    const user = userEvent.setup();
    render(<EmailAccountForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Email'), 'user@gmail.com');
    expect(screen.getByLabelText('Email')).toHaveValue('user@gmail.com');
  });

  it('submits the selected provider and typed email', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EmailAccountForm onSubmit={onSubmit} />);
    await user.selectOptions(screen.getByLabelText('Provider'), 'gmail');
    await user.type(screen.getByLabelText('Email'), 'user@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ provider: 'gmail', email: 'user@gmail.com' });
  });

  it('does not submit empty values through the visible submit button', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EmailAccountForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('prevents the default browser submission', () => {
    const { container } = render(<EmailAccountForm onSubmit={vi.fn()} />);
    expect(fireEvent.submit(container.querySelector('form') as HTMLFormElement)).toBe(false);
  });

  it('blocks submission after switching the provider back to the placeholder', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EmailAccountForm onSubmit={onSubmit} />);
    const select = screen.getByLabelText('Provider');
    await user.selectOptions(select, 'microsoft');
    await user.selectOptions(select, '');
    await user.type(screen.getByLabelText('Email'), 'ops@corp.io');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('associates labels with controls through matching ids', () => {
    render(<EmailAccountForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Provider')).toHaveAttribute('id', 'provider');
    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email');
  });

  it('stacks the fields vertically', () => {
    const { container } = render(<EmailAccountForm onSubmit={vi.fn()} />);
    expect(container.querySelector('form')).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('keeps values after submitting (no reset)', async () => {
    const user = userEvent.setup();
    render(<EmailAccountForm onSubmit={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('Provider'), 'custom_smtp');
    await user.type(screen.getByLabelText('Email'), 'ops@corp.io');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByLabelText('Provider')).toHaveValue('custom_smtp');
    expect(screen.getByLabelText('Email')).toHaveValue('ops@corp.io');
  });
});
