import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactForm } from '@/components/contacts/ContactForm';

describe('ContactForm', () => {
  it('renders name and email inputs', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
  });

  it('shows red star marker for required email but not optional name', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    const emailLabel = screen.getByText('Email').closest('label');
    expect(emailLabel).toHaveTextContent('Email *');
    const nameLabel = screen.getByText('Name').closest('label');
    expect(nameLabel).toHaveTextContent('Name');
    expect(nameLabel).not.toHaveTextContent('Name *');
  });

  it('uses an email input type for the email field', () => {
    render(<ContactForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('type', 'email');
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
    expect(screen.getByLabelText(/Email/)).toHaveValue('');
  });

  it('updates each field as the user types', async () => {
    const user = userEvent.setup();
    render(<ContactForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
    expect(screen.getByLabelText('Name')).toHaveValue('Jane');
    expect(screen.getByLabelText(/Email/)).toHaveValue('jane@example.com');
  });

  it('submits the entered values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
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
    await user.type(screen.getByLabelText(/Email/), 'solo@example.com');
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
    await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Jane');
    expect(screen.getByLabelText(/Email/)).toHaveValue('jane@example.com');
  });

  it('disables the submit button and shows saving text when saving', () => {
    render(<ContactForm onSubmit={vi.fn()} saving />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('clears the pending state after the submit settles', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<ContactForm onSubmit={onSubmit} />);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  });

  it('prevents the default form submission', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContactForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
    const form = document.querySelector('form') as HTMLFormElement;
    expect(fireEvent.submit(form)).toBe(false);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('stacks the fields vertically', () => {
    const { container } = render(<ContactForm onSubmit={vi.fn()} />);
    expect(container.querySelector('form')).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  describe('validation', () => {
    it('shows error when email is empty on submit', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<ContactForm onSubmit={onSubmit} />);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });

    it('shows error when email format is invalid', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<ContactForm onSubmit={onSubmit} />);
      await user.type(screen.getByLabelText(/Email/), 'not-an-email');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Invalid email format')).toBeInTheDocument();
    });

    it('clears email error when user types a valid email', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<ContactForm onSubmit={onSubmit} />);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
    });

    it('shows red border on email input when invalid', async () => {
      const user = userEvent.setup();
      render(<ContactForm onSubmit={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      const emailInput = screen.getByLabelText(/Email/);
      expect(emailInput).toHaveClass('border-error');
    });

    it('shows error when name exceeds 100 characters', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<ContactForm onSubmit={onSubmit} />);
      await user.type(screen.getByLabelText('Name'), 'a'.repeat(101));
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Name must be 100 characters or fewer')).toBeInTheDocument();
    });

    it('allows submission with valid name and email', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<ContactForm onSubmit={onSubmit} />);
      await user.type(screen.getByLabelText('Name'), 'Jane');
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Jane', email: 'jane@example.com' });
    });
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
      expect(screen.getByLabelText(/Score/)).toBeInTheDocument();
      expect(screen.getByText('VIP')).toBeInTheDocument();
    });

    it('uses the correct input type for each field type', () => {
      render(<ContactForm onSubmit={vi.fn()} fields={fields} />);
      expect(screen.getByLabelText('T-shirt size')).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText('Birth date')).toHaveAttribute('type', 'date');
      expect(screen.getByLabelText(/Score/)).toHaveAttribute('type', 'number');
    });

    it('shows red star marker for required custom fields', () => {
      render(<ContactForm onSubmit={vi.fn()} fields={fields} />);
      const scoreLabel = screen.getByText('Score').closest('label');
      expect(scoreLabel).toHaveTextContent('Score *');
      const shirtLabel = screen.getByText('T-shirt size').closest('label');
      expect(shirtLabel).not.toHaveTextContent('T-shirt size *');
    });

    it('renders boolean fields as checkboxes', () => {
      render(<ContactForm onSubmit={vi.fn()} fields={fields} />);
      const vipCheckbox = screen.getByRole('checkbox', { name: /VIP/ });
      expect(vipCheckbox).toBeInTheDocument();
      expect(vipCheckbox).not.toBeChecked();
    });

    it('renders dropdown fields as combobox selects', () => {
      const dropdownFields = [
        {
          id: 'f5',
          name: 'tier',
          label: 'Tier',
          field_type: 'dropdown' as const,
          is_required: false,
          options: [
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro' },
          ],
        },
      ];
      render(<ContactForm onSubmit={vi.fn()} fields={dropdownFields} />);
      expect(screen.getByRole('combobox', { name: 'Tier' })).toBeInTheDocument();
    });

    it('includes dropdown field values in the submit payload', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const dropdownFields = [
        {
          id: 'f5',
          name: 'tier',
          label: 'Tier',
          field_type: 'dropdown' as const,
          is_required: false,
          options: [
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro' },
          ],
        },
      ];
      render(<ContactForm onSubmit={onSubmit} fields={dropdownFields} />);
      await user.type(screen.getByLabelText('Name'), 'Jane');
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      fireEvent.click(screen.getByRole('combobox', { name: 'Tier' }));
      await user.click(screen.getByRole('option', { name: 'Pro' }));
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Jane',
        email: 'jane@example.com',
        customFields: { tier: 'pro' },
      });
    });

    it('includes custom field values in the submit payload', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<ContactForm onSubmit={onSubmit} fields={fields} />);
      await user.type(screen.getByLabelText('Name'), 'Jane');
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.type(screen.getByLabelText('T-shirt size'), 'M');
      await user.type(screen.getByLabelText(/Score/), '42');
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
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Jane',
        email: 'jane@example.com',
      });
    });
  });

  describe('custom field validation', () => {
    it('shows error when a required custom field is empty', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const requiredField = [
        { id: 'f1', name: 'company', label: 'Company', field_type: 'text' as const, is_required: true },
      ];
      render(<ContactForm onSubmit={onSubmit} fields={requiredField} />);
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Company is required')).toBeInTheDocument();
    });

    it('shows error when a required number field is empty', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const requiredNumber = [
        { id: 'f1', name: 'score', label: 'Score', field_type: 'number' as const, is_required: true },
      ];
      render(<ContactForm onSubmit={onSubmit} fields={requiredNumber} />);
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Score is required')).toBeInTheDocument();
    });

    it('shows error when number field value is not a valid number', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const numberField = [
        { id: 'f1', name: 'score', label: 'Score', field_type: 'number' as const, is_required: false },
      ];
      render(
        <ContactForm
          onSubmit={onSubmit}
          fields={numberField}
          initialValues={{ email: 'jane@example.com', customFields: { score: 'abc' } }}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Score must be a valid number')).toBeInTheDocument();
    });

    it('shows error when date field value is not YYYY-MM-DD', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const dateField = [
        { id: 'f1', name: 'birth_date', label: 'Birth date', field_type: 'date' as const, is_required: false },
      ];
      render(
        <ContactForm
          onSubmit={onSubmit}
          fields={dateField}
          initialValues={{ email: 'jane@example.com', customFields: { birth_date: '01/15/2000' } }}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Birth date must be a valid date (YYYY-MM-DD)')).toBeInTheDocument();
    });

    it('clears custom field error when user types a valid value', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const requiredField = [
        { id: 'f1', name: 'company', label: 'Company', field_type: 'text' as const, is_required: true },
      ];
      render(<ContactForm onSubmit={onSubmit} fields={requiredField} />);
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByText('Company is required')).toBeInTheDocument();
      await user.type(screen.getByLabelText(/Company/), 'Acme');
      expect(screen.queryByText('Company is required')).not.toBeInTheDocument();
    });

    it('shows red border on invalid custom field input', async () => {
      const user = userEvent.setup();
      const requiredField = [
        { id: 'f1', name: 'company', label: 'Company', field_type: 'text' as const, is_required: true },
      ];
      render(<ContactForm onSubmit={vi.fn()} fields={requiredField} />);
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      const companyInput = screen.getByLabelText(/Company/);
      expect(companyInput).toHaveClass('border-error');
    });

    it('shows red star marker for required boolean field', () => {
      const requiredBoolean = [
        { id: 'f1', name: 'agree', label: 'I agree', field_type: 'boolean' as const, is_required: true },
      ];
      render(<ContactForm onSubmit={vi.fn()} fields={requiredBoolean} />);
      const checkboxLabel = screen.getByText('I agree').closest('label');
      expect(checkboxLabel).toHaveTextContent('I agree *');
    });

    it('shows error when required boolean is not checked', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const requiredBoolean = [
        { id: 'f1', name: 'agree', label: 'I agree', field_type: 'boolean' as const, is_required: true },
      ];
      render(<ContactForm onSubmit={onSubmit} fields={requiredBoolean} />);
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('I agree is required')).toBeInTheDocument();
    });

    it('allows submission when required boolean is checked', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const requiredBoolean = [
        { id: 'f1', name: 'agree', label: 'I agree', field_type: 'boolean' as const, is_required: true },
      ];
      render(<ContactForm onSubmit={onSubmit} fields={requiredBoolean} />);
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.click(screen.getByRole('checkbox', { name: /I agree/ }));
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledWith({
        name: undefined,
        email: 'jane@example.com',
        customFields: { agree: 'true' },
      });
    });

    it('shows red star marker for required dropdown field', () => {
      const requiredDropdown = [
        {
          id: 'f1',
          name: 'tier',
          label: 'Tier',
          field_type: 'dropdown' as const,
          is_required: true,
          options: [
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro' },
          ],
        },
      ];
      render(<ContactForm onSubmit={vi.fn()} fields={requiredDropdown} />);
      const dropdownLabel = screen.getByText('Tier').closest('label');
      expect(dropdownLabel).toHaveTextContent('Tier *');
    });

    it('shows error when required dropdown has no selection', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const requiredDropdown = [
        {
          id: 'f1',
          name: 'tier',
          label: 'Tier',
          field_type: 'dropdown' as const,
          is_required: true,
          options: [
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro' },
          ],
        },
      ];
      render(<ContactForm onSubmit={onSubmit} fields={requiredDropdown} />);
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Tier is required')).toBeInTheDocument();
    });

    it('allows submission when required dropdown has a selection', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const requiredDropdown = [
        {
          id: 'f1',
          name: 'tier',
          label: 'Tier',
          field_type: 'dropdown' as const,
          is_required: true,
          options: [
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro' },
          ],
        },
      ];
      render(<ContactForm onSubmit={onSubmit} fields={requiredDropdown} />);
      await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
      fireEvent.click(screen.getByRole('combobox', { name: 'Tier' }));
      await user.click(screen.getByRole('option', { name: 'Pro' }));
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledWith({
        name: undefined,
        email: 'jane@example.com',
        customFields: { tier: 'pro' },
      });
    });

    it('shows multiple errors at once for multiple invalid fields', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const multiFields = [
        { id: 'f1', name: 'company', label: 'Company', field_type: 'text' as const, is_required: true },
        { id: 'f2', name: 'score', label: 'Score', field_type: 'number' as const, is_required: true },
      ];
      render(<ContactForm onSubmit={onSubmit} fields={multiFields} />);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('Company is required')).toBeInTheDocument();
      expect(screen.getByText('Score is required')).toBeInTheDocument();
    });
  });
});
