import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactForm } from '@/components/contacts/ContactForm';

describe('ContactForm', () => {
  it('renders name and email inputs', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('marks email required and name optional', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Name')).not.toBeRequired();
    expect(screen.getByLabelText('Email')).toBeRequired();
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

  it('starts with name and email empty', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('updates each field as the user types', async () => {
    const user = userEvent.setup();
    render(<ContactForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    expect(screen.getByLabelText('Name')).toHaveValue('Jane');
    expect(screen.getByLabelText('Email')).toHaveValue('jane@example.com');
  });

  it('submits the entered values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Jane',
      email: 'jane@example.com',
    });
  });

  it('sends name as undefined when left blank', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Email'), 'solo@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: undefined,
      email: 'solo@example.com',
    });
  });

  it('does not clear the fields after submitting', async () => {
    const user = userEvent.setup();
    render(<ContactForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Jane');
    expect(screen.getByLabelText('Email')).toHaveValue('jane@example.com');
  });

  it('does not submit while the required fields fail browser validation', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Email')).toBeInvalid();
  });

  it('disables the submit button and shows saving text when saving', () => {
    render(<ContactForm onSubmit={vi.fn()} saving />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
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

  it('stacks the fields vertically', () => {
    const { container } = render(<ContactForm onSubmit={vi.fn()} />);
    expect(container.querySelector('form')).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  describe('custom fields', () => {
    const fields = [
      { id: 'f1', name: 't_shirt_size', label: 'T-shirt size', field_type: 'text' as const, is_required: false },
      { id: 'f2', name: 'birth_date', label: 'Birth date', field_type: 'date' as const, is_required: false },
      { id: 'f3', name: 'is_vip', label: 'VIP', field_type: 'boolean' as const, is_required: false },
      { id: 'f4', name: 'score', label: 'Score', field_type: 'number' as const, is_required: true },
    ];

    it('renders custom field inputs when fields are provided', () => {
      render(<ContactForm onSubmit={vi.fn()} fields={fields} />);
      expect(screen.getByLabelText('T-shirt size')).toBeInTheDocument();
      expect(screen.getByLabelText('Birth date')).toBeInTheDocument();
      expect(screen.getByLabelText('Score')).toBeInTheDocument();
      expect(screen.getByText('VIP')).toBeInTheDocument();
    });

    it('uses the correct input type for each field type', () => {
      render(<ContactForm onSubmit={vi.fn()} fields={fields} />);
      expect(screen.getByLabelText('T-shirt size')).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText('Birth date')).toHaveAttribute('type', 'date');
      expect(screen.getByLabelText('Score')).toHaveAttribute('type', 'number');
    });

    it('marks required custom fields as required', () => {
      render(<ContactForm onSubmit={vi.fn()} fields={fields} />);
      expect(screen.getByLabelText('Score')).toBeRequired();
      expect(screen.getByLabelText('T-shirt size')).not.toBeRequired();
    });

    it('renders boolean fields as checkboxes', () => {
      render(<ContactForm onSubmit={vi.fn()} fields={fields} />);
      const vipCheckbox = screen.getByRole('checkbox', { name: /VIP/ });
      expect(vipCheckbox).toBeInTheDocument();
      expect(vipCheckbox).not.toBeChecked();
    });

    it('includes custom field values in the submit payload', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<ContactForm onSubmit={onSubmit} fields={fields} />);
      await user.type(screen.getByLabelText('Name'), 'Jane');
      await user.type(screen.getByLabelText('Email'), 'jane@example.com');
      await user.type(screen.getByLabelText('T-shirt size'), 'M');
      await user.type(screen.getByLabelText('Score'), '42');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Jane',
        email: 'jane@example.com',
        customFields: { t_shirt_size: 'M', score: '42' },
      });
    });

    it('does not include customFields when no custom values are set', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const optionalFields = [
        { id: 'f1', name: 't_shirt_size', label: 'T-shirt size', field_type: 'text' as const, is_required: false },
      ];
      render(<ContactForm onSubmit={onSubmit} fields={optionalFields} />);
      await user.type(screen.getByLabelText('Name'), 'Jane');
      await user.type(screen.getByLabelText('Email'), 'jane@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Jane',
        email: 'jane@example.com',
      });
    });
  });
});
