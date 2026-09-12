import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FieldForm } from '@/components/settings/FieldForm';

describe('FieldForm', () => {
  it('renders label, token, type, and required inputs', () => {
    render(<FieldForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Field label')).toBeInTheDocument();
    expect(screen.getByLabelText(/Token/)).toBeInTheDocument();
    expect(screen.getByLabelText('Field type')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('auto-generates token from label', async () => {
    const user = userEvent.setup();
    render(<FieldForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Field label'), 'T-shirt size');
    expect(screen.getByLabelText(/Token/)).toHaveValue('t_shirt_size');
  });

  it('shows the token in {{token}} format', async () => {
    const user = userEvent.setup();
    render(<FieldForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Field label'), 'Shirt size');
    expect(screen.getByText(/\{\{shirt_size\}\}/)).toBeInTheDocument();
  });

  it('allows editing the token manually', async () => {
    const user = userEvent.setup();
    render(<FieldForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Field label'), 'Test Field');
    await user.click(screen.getByRole('button', { name: 'Edit token' }));
    const tokenInput = screen.getByLabelText(/Token/);
    await user.clear(tokenInput);
    await user.type(tokenInput, 'custom_token');
    expect(tokenInput).toHaveValue('custom_token');
  });

  it('returns to auto-generate when toggled off', async () => {
    const user = userEvent.setup();
    render(<FieldForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Field label'), 'Test Field');
    await user.click(screen.getByRole('button', { name: 'Edit token' }));
    await user.click(screen.getByRole('button', { name: 'Auto-generate' }));
    expect(screen.getByLabelText(/Token/)).toHaveValue('test_field');
  });

  it('shows validation error for invalid token', async () => {
    const user = userEvent.setup();
    render(<FieldForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Field label'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Edit token' }));
    const tokenInput = screen.getByLabelText(/Token/);
    await user.clear(tokenInput);
    await user.type(tokenInput, '123invalid');
    expect(screen.getByText(/must start with a letter/)).toBeInTheDocument();
  });

  it('shows error for duplicate token', async () => {
    const user = userEvent.setup();
    render(<FieldForm onSubmit={vi.fn()} existingTokens={['existing_field']} />);
    await user.type(screen.getByLabelText('Field label'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Edit token' }));
    const tokenInput = screen.getByLabelText(/Token/);
    await user.clear(tokenInput);
    await user.type(tokenInput, 'existing_field');
    expect(screen.getByText('A field with this token already exists.')).toBeInTheDocument();
  });

  it('disables submit when label is empty', () => {
    render(<FieldForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save field' })).toBeDisabled();
  });

  it('disables submit while saving', () => {
    render(<FieldForm onSubmit={vi.fn()} saving />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('submits label, token, type, and required values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FieldForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Field label'), 'T-shirt size');
    await user.click(screen.getByText('Required'));
    await user.click(screen.getByRole('button', { name: 'Save field' }));
    expect(onSubmit).toHaveBeenCalledWith({
      label: 'T-shirt size',
      name: 't_shirt_size',
      field_type: 'text',
      is_required: true,
    });
  });

  it('renders all five field type options', () => {
    render(<FieldForm onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Field type' }));
    expect(screen.getByRole('option', { name: 'Text' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Number' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Date' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Boolean (Yes/No)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dropdown' })).toBeInTheDocument();
  });

  it('shows options editor when dropdown type is selected', async () => {
    const user = userEvent.setup();
    render(<FieldForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Field label'), 'Shirt size');
    fireEvent.click(screen.getByRole('combobox', { name: 'Field type' }));
    await user.click(screen.getByRole('option', { name: 'Dropdown' }));
    expect(screen.getByText('Options')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add option' })).toBeInTheDocument();
  });

  it('does not show options editor for non-dropdown types', () => {
    render(<FieldForm onSubmit={vi.fn()} />);
    expect(screen.queryByText('Options')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add option' })).not.toBeInTheDocument();
  });

  it('allows adding and removing options', async () => {
    const user = userEvent.setup();
    render(<FieldForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Field label'), 'Shirt size');
    fireEvent.click(screen.getByRole('combobox', { name: 'Field type' }));
    await user.click(screen.getByRole('option', { name: 'Dropdown' }));
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getByPlaceholderText('Option 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getByPlaceholderText('Option 2')).toBeInTheDocument();
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await user.click(removeButtons[0]);
    expect(screen.queryByPlaceholderText('Option 2')).not.toBeInTheDocument();
  });

  it('submits options when dropdown type is selected', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FieldForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Field label'), 'Shirt size');
    fireEvent.click(screen.getByRole('combobox', { name: 'Field type' }));
    await user.click(screen.getByRole('option', { name: 'Dropdown' }));
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await user.type(screen.getByPlaceholderText('Option 1'), 'Small');
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await user.type(screen.getByPlaceholderText('Option 2'), 'Large');
    await user.click(screen.getByRole('button', { name: 'Save field' }));
    expect(onSubmit).toHaveBeenCalledWith({
      label: 'Shirt size',
      name: 'shirt_size',
      field_type: 'dropdown',
      is_required: false,
      options: [
        { value: 'Small', label: 'Small' },
        { value: 'Large', label: 'Large' },
      ],
    });
  });

  it('supports initial values with options for edit mode', () => {
    render(
      <FieldForm
        onSubmit={vi.fn()}
        initialValues={{
          label: 'Size',
          name: 'size',
          field_type: 'dropdown',
          is_required: false,
          options: [{ value: 'S', label: 'Small' }],
        }}
      />
    );
    expect(screen.getByLabelText('Field label')).toHaveValue('Size');
    expect(screen.getByRole('combobox', { name: 'Field type' })).toHaveTextContent('Dropdown');
    expect(screen.getByText('Options')).toBeInTheDocument();
  });

  it('supports initial values for edit mode', () => {
    render(
      <FieldForm
        onSubmit={vi.fn()}
        initialValues={{ label: 'Size', name: 'size', field_type: 'text', is_required: true }}
      />
    );
    expect(screen.getByLabelText('Field label')).toHaveValue('Size');
    expect(screen.getByLabelText(/Token/)).toHaveValue('size');
    expect(screen.getByRole('combobox', { name: 'Field type' })).toHaveTextContent('Text');
    expect(screen.getByRole('checkbox', { name: /Required/ })).toBeChecked();
  });
});
