import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderConnectionDialog } from '@/components/email-accounts/ProviderConnectionDialog';

function setup(props: Partial<React.ComponentProps<typeof ProviderConnectionDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onConnect = vi.fn();
  const view = render(
    <ProviderConnectionDialog
      open
      onOpenChange={onOpenChange}
      provider="Gmail"
      onConnect={onConnect}
      {...props}
    />
  );
  return { ...view, onOpenChange, onConnect };
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'me@gmail.com');
  await user.type(screen.getByLabelText('App Password'), 'app-password');
}

describe('ProviderConnectionDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = setup({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a provider-specific title', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Connect Gmail' })).toBeInTheDocument();
  });

  it('renders the title for another provider', () => {
    setup({ provider: 'Custom SMTP' });
    expect(screen.getByRole('heading', { name: 'Connect Custom SMTP' })).toBeInTheDocument();
  });

  it('renders the instructional copy', () => {
    setup();
    expect(
      screen.getByText('Enter your Gmail address and App Password to send emails.')
    ).toBeInTheDocument();
  });

  it('renders required email and password inputs with placeholders', () => {
    setup();
    const email = screen.getByLabelText('Email');
    const secret = screen.getByLabelText('App Password');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toBeRequired();
    expect(email).toHaveAttribute('placeholder', 'you@gmail.com');
    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).toBeRequired();
    expect(secret).toHaveAttribute('placeholder', 'xxxx xxxx xxxx xxxx');
  });

  it('shows no error message initially', () => {
    setup();
    expect(screen.queryByText('Failed to connect account. Please try again.')).not.toBeInTheDocument();
  });

  it('updates both fields as the user types', async () => {
    const user = userEvent.setup();
    setup();
    await fillCredentials(user);
    expect(screen.getByLabelText('Email')).toHaveValue('me@gmail.com');
    expect(screen.getByLabelText('App Password')).toHaveValue('app-password');
  });

  it('calls onConnect with the credentials on submit', async () => {
    const user = userEvent.setup();
    const { onConnect } = setup();
    onConnect.mockResolvedValue(undefined);
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledWith('me@gmail.com', 'app-password');
  });

  it('clears both fields after a successful connection', async () => {
    const user = userEvent.setup();
    const { onConnect } = setup();
    onConnect.mockResolvedValue(undefined);
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveValue(''));
    expect(screen.getByLabelText('App Password')).toHaveValue('');
  });

  it('shows a loading spinner on the Connect button while pending', async () => {
    const user = userEvent.setup();
    let resolveConnect!: () => void;
    const onConnect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        })
    );
    setup({ onConnect });
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    const connect = screen.getByRole('button', { name: 'Connect' });
    expect(connect).toBeDisabled();
    expect(connect.querySelector('span.animate-spin')).toBeInTheDocument();
    await act(async () => {
      resolveConnect();
    });
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('shows an error message when onConnect rejects', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn().mockRejectedValue(new Error('smtp refused'));
    setup({ onConnect });
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() =>
      expect(screen.getByText('Failed to connect account. Please try again.')).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('keeps the entered credentials when the connection fails', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn().mockRejectedValue(new Error('nope'));
    setup({ onConnect });
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() =>
      expect(screen.getByText('Failed to connect account. Please try again.')).toBeInTheDocument()
    );
    expect(screen.getByLabelText('Email')).toHaveValue('me@gmail.com');
    expect(screen.getByLabelText('App Password')).toHaveValue('app-password');
  });

  it('clears a previous error on the next submit attempt', async () => {
    const user = userEvent.setup();
    const onConnect = vi
      .fn()
      .mockRejectedValueOnce(new Error('first fails'))
      .mockResolvedValueOnce(undefined);
    setup({ onConnect });
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() =>
      expect(screen.getByText('Failed to connect account. Please try again.')).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() =>
      expect(
        screen.queryByText('Failed to connect account. Please try again.')
      ).not.toBeInTheDocument()
    );
    expect(onConnect).toHaveBeenCalledTimes(2);
  });

  it('closes the dialog when Cancel is clicked without connecting', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onConnect } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('closes the dialog when the overlay is clicked', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();
    const overlay = document.querySelector('.fixed.inset-0.bg-neutral-900\\/50') as HTMLElement;
    await user.click(overlay);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not submit while the browser validation fails', async () => {
    const user = userEvent.setup();
    const { onConnect } = setup();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('prevents the default form submission', () => {
    const { container, onConnect } = setup();
    onConnect.mockResolvedValue(undefined);
    expect(fireEvent.submit(container.querySelector('form') as HTMLFormElement)).toBe(false);
    expect(onConnect).toHaveBeenCalledWith('', '');
  });

  it('renders Cancel as a non-submitting secondary button', () => {
    setup();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveAttribute('type', 'button');
    expect(cancel).toHaveClass('bg-surface');
  });
});
