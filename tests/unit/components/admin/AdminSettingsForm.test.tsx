import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminSettingsForm } from '@/components/admin/AdminSettingsForm';

describe('AdminSettingsForm', () => {
  it('renders the limit field with its label', () => {
    render(<AdminSettingsForm />);
    expect(screen.getByLabelText('Global daily email limit')).toBeInTheDocument();
  });

  it('initializes both limit inputs and the sending toggle from the provided settings', () => {
    render(
      <AdminSettingsForm
        settings={{
          default_daily_email_limit: 250,
          global_daily_email_limit: 500,
          email_sending_enabled: true,
        }}
      />
    );
    expect(screen.getByLabelText('Default daily email limit')).toHaveValue(250);
    expect(screen.getByLabelText('Global daily email limit')).toHaveValue(500);
    expect(screen.getByLabelText('Enable email sending')).toBeChecked();
  });

  it('renders a submit button', () => {
    render(<AdminSettingsForm />);
    const button = screen.getByRole('button', { name: 'Save settings' });
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('associates the label with the generated input id', () => {
    render(<AdminSettingsForm />);
    expect(screen.getByLabelText('Global daily email limit')).toHaveAttribute(
      'id',
      'global-daily-email-limit'
    );
  });

  it('updates the controlled value as the user types', async () => {
    const user = userEvent.setup();
    render(<AdminSettingsForm />);
    const input = screen.getByLabelText('Global daily email limit');
    await user.clear(input);
    await user.type(input, '1200');
    expect(input).toHaveValue(1200);
  });

  it('supports clearing the field entirely', async () => {
    const user = userEvent.setup();
    render(<AdminSettingsForm />);
    const input = screen.getByLabelText('Global daily email limit');
    await user.clear(input);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('updates on a direct change event', () => {
    render(<AdminSettingsForm />);
    const input = screen.getByLabelText('Global daily email limit');
    fireEvent.change(input, { target: { value: '42' } });
    expect(input).toHaveValue(42);
  });

  it('prevents the default form submission', () => {
    const { container } = render(<AdminSettingsForm />);
    const form = container.querySelector('form') as HTMLFormElement;
    // fireEvent returns false when the handler called preventDefault()
    expect(fireEvent.submit(form)).toBe(false);
  });

  it('keeps the typed value after submitting', async () => {
    const user = userEvent.setup();
    const { container } = render(<AdminSettingsForm />);
    const input = screen.getByLabelText('Global daily email limit');
    await user.clear(input);
    await user.type(input, '999');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(input).toHaveValue(999);
    expect(container.querySelector('form')).toBeInTheDocument();
  });

  it('does not navigate away when the submit button is clicked', async () => {
    const user = userEvent.setup();
    const submitHandler = vi.fn();
    const { container } = render(<AdminSettingsForm />);
    const form = container.querySelector('form') as HTMLFormElement;
    form.addEventListener('submit', submitHandler);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(submitHandler).toHaveBeenCalledTimes(1);
    expect(submitHandler.mock.calls[0][0].defaultPrevented).toBe(true);
  });

  it('constrains the form width and stacks fields vertically', () => {
    const { container } = render(<AdminSettingsForm />);
    expect(container.querySelector('form')).toHaveClass('flex', 'flex-col', 'gap-4', 'max-w-md');
  });
});
