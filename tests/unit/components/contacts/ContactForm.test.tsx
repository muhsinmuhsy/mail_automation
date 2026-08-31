import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactForm } from '@/components/contacts/ContactForm';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ContactForm', () => {
  it('renders name, email and company inputs', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Company')).toBeInTheDocument();
  });

  it('marks name and email required but company optional', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toBeRequired();
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Company')).not.toBeRequired();
  });

  it('uses an email input type for the email field', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
  });

  it('renders an enabled Save button initially', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('starts with all fields empty', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Company')).toHaveValue('');
  });

  it('updates each field as the user types', async () => {
    const user = userEvent.setup();
    render(<ContactForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Company'), 'Acme');
    expect(screen.getByLabelText('Name')).toHaveValue('Jane');
    expect(screen.getByLabelText('Email')).toHaveValue('jane@example.com');
    expect(screen.getByLabelText('Company')).toHaveValue('Acme');
  });

  it('submits the entered values including company', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Company'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Jane',
      email: 'jane@example.com',
      company: 'Acme',
    });
  });

  it('sends company as undefined when left blank', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Solo');
    await user.type(screen.getByLabelText('Email'), 'solo@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Solo',
      email: 'solo@example.com',
      company: undefined,
    });
  });

  it('resets every field after a successful submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Company'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''));
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Company')).toHaveValue('');
  });

  it('does not submit while the required fields fail browser validation', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeInvalid();
  });

  it('shows a pending label and disables the button while submitting', async () => {
    const user = userEvent.setup();
    const { promise, resolve } = deferred();
    const onSubmit = vi.fn(() => promise);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const pendingButton = screen.getByRole('button', { name: 'Saving…' });
    expect(pendingButton).toBeDisabled();
    await act(async () => {
      resolve();
      await promise;
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('clears the pending state after the submit settles', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<ContactForm onSubmit={onSubmit} />);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  });

  it('prevents the default form submission', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<ContactForm onSubmit={onSubmit} />);
    expect(fireEvent.submit(container.querySelector('form') as HTMLFormElement)).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('supports submitting twice in a row', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'First');
    await user.type(screen.getByLabelText('Email'), 'first@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''));
    await user.type(screen.getByLabelText('Name'), 'Second');
    await user.type(screen.getByLabelText('Email'), 'second@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[0][0].name).toBe('First');
    expect(onSubmit.mock.calls[1][0].name).toBe('Second');
  });

  it('treats a whitespace-only company as a truthy value', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Blank Co');
    await user.type(screen.getByLabelText('Email'), 'blank@example.com');
    await user.type(screen.getByLabelText('Company'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Blank Co',
      email: 'blank@example.com',
      company: '   ',
    });
  });

  it('stacks the fields vertically', () => {
    const { container } = render(<ContactForm onSubmit={vi.fn()} />);
    expect(container.querySelector('form')).toHaveClass('flex', 'flex-col', 'gap-4');
  });
});
