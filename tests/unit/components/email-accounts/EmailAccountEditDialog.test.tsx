import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailAccountEditDialog } from '@/components/email-accounts/EmailAccountEditDialog';

function setup(props: Partial<React.ComponentProps<typeof EmailAccountEditDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onSave = vi.fn();
  const view = render(
    <EmailAccountEditDialog
      open
      onOpenChange={onOpenChange}
      email="me@gmail.com"
      onSave={onSave}
      {...props}
    />
  );
  return { ...view, onOpenChange, onSave };
}

describe('EmailAccountEditDialog', () => {
  // App password disabled — commented out for future re-enablement
  it.skip('app password tests disabled — commented out for future re-enablement', () => {});
  /*
  it('renders nothing when closed', () => {
    const { container } = setup({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dialog title when open', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Edit App Password' })).toBeInTheDocument();
  });

  it('renders a description naming the account and the limitation', () => {
    setup();
    expect(
      screen.getByText(
        'Update the app password for me@gmail.com. Only the app password can be changed here.'
      )
    ).toBeInTheDocument();
  });

  it('renders a required password input with an autocomplete hint', () => {
    setup();
    const input = screen.getByLabelText('App Password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('autocomplete', 'current-password');
    expect(input).toHaveValue('');
  });

  it('disables Save until a secret is entered', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('enables Save once a non-empty secret is typed', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText('App Password'), 'abcd efgh ijkl mnop');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('keeps Save disabled for a whitespace-only secret', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText('App Password'), '    ');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('calls onSave with the secret on submit', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    await user.type(screen.getByLabelText('App Password'), 'secret-value');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('secret-value');
  });

  it('ignores a submit with a whitespace-only secret', async () => {
    const user = userEvent.setup();
    const { container, onSave } = setup();
    await user.type(screen.getByLabelText('App Password'), '   ');
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('prevents the default form submission', async () => {
    const user = userEvent.setup();
    const { container, onSave } = setup();
    await user.type(screen.getByLabelText('App Password'), 'pw');
    expect(fireEvent.submit(container.querySelector('form') as HTMLFormElement)).toBe(false);
    expect(onSave).toHaveBeenCalledWith('pw');
  });

  it('closes and clears the secret when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSave } = setup();
    await user.type(screen.getByLabelText('App Password'), 'to-be-cleared');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('App Password')).toHaveValue('');
  });

  it('clears the secret when the dialog is dismissed via the overlay', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();
    await user.type(screen.getByLabelText('App Password'), 'overlay-clear');
    const overlay = document.querySelector('.fixed.inset-0.bg-neutral-900\\/50') as HTMLElement;
    await user.click(overlay);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText('App Password')).toHaveValue('');
  });

  it('disables both buttons and shows a spinner while loading', () => {
    setup({ loading: true });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(save.querySelector('span.animate-spin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('keeps Save disabled while loading even with a secret typed', async () => {
    const user = userEvent.setup();
    const { rerender, onOpenChange, onSave } = setup();
    await user.type(screen.getByLabelText('App Password'), 'pw');
    rerender(
      <EmailAccountEditDialog
        open
        onOpenChange={onOpenChange}
        email="me@gmail.com"
        onSave={onSave}
        loading
      />
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('defaults loading to false', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('renders Cancel as a non-submitting secondary button', () => {
    setup();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveAttribute('type', 'button');
    expect(cancel).toHaveClass('bg-surface');
  });

  it('reflects the email of a different account', () => {
    setup({ email: 'other@corp.io' });
    expect(screen.getByText(/other@corp\.io/)).toBeInTheDocument();
  });
  */
});
