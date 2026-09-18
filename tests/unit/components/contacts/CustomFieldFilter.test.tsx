import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomFieldFilter, type ActiveFilter } from '@/components/contacts/CustomFieldFilter';

const textField = {
  id: 'f-text',
  name: 'role',
  label: 'Role',
  field_type: 'text' as const,
};

const numberField = {
  id: 'f-num',
  name: 'score',
  label: 'Score',
  field_type: 'number' as const,
};

const dateField = {
  id: 'f-date',
  name: 'birthday',
  label: 'Birthday',
  field_type: 'date' as const,
};

const booleanField = {
  id: 'f-bool',
  name: 'subscribed',
  label: 'Subscribed',
  field_type: 'boolean' as const,
};

const dropdownField = {
  id: 'f-drop',
  name: 'status',
  label: 'Status',
  field_type: 'dropdown' as const,
  options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
};

describe('CustomFieldFilter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when no custom fields exist', () => {
    const { container } = render(
      <CustomFieldFilter fields={[]} activeFilters={[]} onAdd={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders Filter button when custom fields exist', () => {
    render(
      <CustomFieldFilter fields={[textField]} activeFilters={[]} onAdd={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /Filter/i })).toBeInTheDocument();
  });

  it('opens popover on click showing field selector', async () => {
    const user = userEvent.setup();
    render(
      <CustomFieldFilter fields={[textField, numberField]} activeFilters={[]} onAdd={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Filter/i }));

    await waitFor(() => {
      expect(screen.getByText('Filter by custom field')).toBeInTheDocument();
    });
    expect(screen.getByText('Field')).toBeInTheDocument();
  });

  it('shows operator and value inputs after selecting a text field', async () => {
    const user = userEvent.setup();
    render(
      <CustomFieldFilter fields={[textField]} activeFilters={[]} onAdd={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Filter/i }));
    await waitFor(() => expect(screen.getByText('Filter by custom field')).toBeInTheDocument());

    const fieldCombobox = screen.getByRole('combobox', { name: 'Field' });
    await user.click(fieldCombobox);
    await user.click(screen.getByRole('option', { name: 'Role' }));

    await waitFor(() => {
      expect(screen.getByText('Condition')).toBeInTheDocument();
      expect(screen.getByText('Value')).toBeInTheDocument();
    });
  });

  it('shows date input for date field type', async () => {
    const user = userEvent.setup();
    render(
      <CustomFieldFilter fields={[dateField]} activeFilters={[]} onAdd={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Filter/i }));
    await waitFor(() => expect(screen.getByText('Filter by custom field')).toBeInTheDocument());

    const fieldCombobox = screen.getByRole('combobox', { name: 'Field' });
    await user.click(fieldCombobox);
    await user.click(screen.getByRole('option', { name: 'Birthday' }));

    await waitFor(() => {
      const valueInput = screen.getByLabelText('Value');
      expect(valueInput).toHaveAttribute('type', 'date');
    });
  });

  it('shows number input for number field type', async () => {
    const user = userEvent.setup();
    render(
      <CustomFieldFilter fields={[numberField]} activeFilters={[]} onAdd={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Filter/i }));
    await waitFor(() => expect(screen.getByText('Filter by custom field')).toBeInTheDocument());

    const fieldCombobox = screen.getByRole('combobox', { name: 'Field' });
    await user.click(fieldCombobox);
    await user.click(screen.getByRole('option', { name: 'Score' }));

    await waitFor(() => {
      const valueInput = screen.getByLabelText('Value');
      expect(valueInput).toHaveAttribute('type', 'number');
    });
  });

  it('shows Yes/No dropdown for boolean field type', async () => {
    const user = userEvent.setup();
    render(
      <CustomFieldFilter fields={[booleanField]} activeFilters={[]} onAdd={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Filter/i }));
    await waitFor(() => expect(screen.getByText('Filter by custom field')).toBeInTheDocument());

    const fieldCombobox = screen.getByRole('combobox', { name: 'Field' });
    await user.click(fieldCombobox);
    await user.click(screen.getByRole('option', { name: 'Subscribed' }));

    await waitFor(() => {
      expect(screen.getByText('Value')).toBeInTheDocument();
    });
  });

  it('shows option dropdown for dropdown field type', async () => {
    const user = userEvent.setup();
    render(
      <CustomFieldFilter fields={[dropdownField]} activeFilters={[]} onAdd={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Filter/i }));
    await waitFor(() => expect(screen.getByText('Filter by custom field')).toBeInTheDocument());

    const fieldCombobox = screen.getByRole('combobox', { name: 'Field' });
    await user.click(fieldCombobox);
    await user.click(screen.getByRole('option', { name: 'Status' }));

    await waitFor(() => {
      expect(screen.getByText('Value')).toBeInTheDocument();
    });
  });

  it('calls onAdd with correct filter for text contains', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(
      <CustomFieldFilter fields={[textField]} activeFilters={[]} onAdd={onAdd} />
    );

    await user.click(screen.getByRole('button', { name: /Filter/i }));
    await waitFor(() => expect(screen.getByText('Filter by custom field')).toBeInTheDocument());

    const fieldCombobox = screen.getByRole('combobox', { name: 'Field' });
    await user.click(fieldCombobox);
    await user.click(screen.getByRole('option', { name: 'Role' }));

    await waitFor(() => expect(screen.getByLabelText('Value')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Value'), 'manager');

    await user.click(screen.getByRole('button', { name: 'Apply filter' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: 'f-text',
        fieldLabel: 'Role',
        fieldType: 'text',
        op: 'contains',
        value: 'manager',
        opLabel: 'contains',
        valueLabel: 'manager',
      })
    );
  });

  it('calls onAdd with Yes/No for boolean field', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(
      <CustomFieldFilter fields={[booleanField]} activeFilters={[]} onAdd={onAdd} />
    );

    await user.click(screen.getByRole('button', { name: /Filter/i }));
    await waitFor(() => expect(screen.getByText('Filter by custom field')).toBeInTheDocument());

    const fieldCombobox = screen.getByRole('combobox', { name: 'Field' });
    await user.click(fieldCombobox);
    await user.click(screen.getByRole('option', { name: 'Subscribed' }));

    await waitFor(() => expect(screen.getByText('Value')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Apply filter' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: 'f-bool',
        fieldLabel: 'Subscribed',
        fieldType: 'boolean',
        op: 'is',
        value: 'true',
        valueLabel: 'Yes',
      })
    );
  });

  it('hides fields that already have active filters', async () => {
    const activeFilters: ActiveFilter[] = [
      {
        fieldId: 'f-text',
        fieldLabel: 'Role',
        fieldType: 'text',
        op: 'contains',
        value: 'manager',
        opLabel: 'contains',
        valueLabel: 'manager',
      },
    ];

    const user = userEvent.setup();
    render(
      <CustomFieldFilter fields={[textField, numberField]} activeFilters={activeFilters} onAdd={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Filter/i }));
    await waitFor(() => expect(screen.getByText('Filter by custom field')).toBeInTheDocument());

    const fieldCombobox = screen.getByRole('combobox', { name: 'Field' });
    await user.click(fieldCombobox);

    expect(screen.queryByRole('option', { name: 'Role' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Score' })).toBeInTheDocument();
  });

  it('disables Apply button when value is empty for text field', async () => {
    const user = userEvent.setup();
    render(
      <CustomFieldFilter fields={[textField]} activeFilters={[]} onAdd={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Filter/i }));
    await waitFor(() => expect(screen.getByText('Filter by custom field')).toBeInTheDocument());

    const fieldCombobox = screen.getByRole('combobox', { name: 'Field' });
    await user.click(fieldCombobox);
    await user.click(screen.getByRole('option', { name: 'Role' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply filter' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Apply filter' })).toBeDisabled();
  });
});
