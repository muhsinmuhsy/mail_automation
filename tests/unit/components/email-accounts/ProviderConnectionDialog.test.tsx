import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderConnectionDialog } from '@/components/email-accounts/ProviderConnectionDialog';

function setup(props: Partial<React.ComponentProps<typeof ProviderConnectionDialog>> = {}) {
  const onConnect = vi.fn(); const onOAuthConnect = vi.fn(); const onOpenChange = vi.fn();
  return { ...render(<ProviderConnectionDialog open provider="Gmail" onConnect={onConnect} onOAuthConnect={onOAuthConnect} onOpenChange={onOpenChange} {...props} />), onConnect, onOAuthConnect, onOpenChange };
}
describe('Google-first connection dialog', () => {
  it('renders nothing when closed', () => {
    expect(setup({ open: false }).container).toBeEmptyDOMElement();
  });
  it('offers Google authorization without asking for credentials', async () => {
    const { onOAuthConnect, onConnect } = setup();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('App Password')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(onOAuthConnect).toHaveBeenCalledOnce(); expect(onConnect).not.toHaveBeenCalled();
  });
  it('shows actionable connection errors', async () => {
    setup({ onOAuthConnect: vi.fn().mockRejectedValue(new Error('Google connection is unavailable.')) });
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Google connection is unavailable.');
  });
  it('supports the explicitly selected SMTP fallback', async () => {
    const user = userEvent.setup(); const { onConnect, onOAuthConnect } = setup();
    await user.click(screen.getByRole('button', { name: /Advanced/ }));
    await user.type(screen.getByLabelText('Email'), 'me@gmail.com');
    await user.type(screen.getByLabelText('App Password'), 'app-password');
    await user.click(screen.getByRole('button', { name: 'Connect with App Password' }));
    expect(onConnect).toHaveBeenCalledWith('me@gmail.com', 'app-password');
    expect(onOAuthConnect).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('App Password')).toHaveValue(''));
  });
  it('retains fallback input on failure', async () => {
    const user = userEvent.setup(); setup({ onConnect: vi.fn().mockRejectedValue(new Error('Connection failed.')) });
    await user.click(screen.getByRole('button', { name: /Advanced/ }));
    await user.type(screen.getByLabelText('Email'), 'me@gmail.com');
    await user.type(screen.getByLabelText('App Password'), 'app-password');
    await user.click(screen.getByRole('button', { name: 'Connect with App Password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection failed.');
    expect(screen.getByLabelText('Email')).toHaveValue('me@gmail.com');
  });
  it('does not expose connection controls for unavailable providers', () => {
    setup({ provider: 'Microsoft' });
    expect(screen.getByText('This provider is coming soon.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });
  it('closes on cancel', async () => {
    const { onOpenChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
