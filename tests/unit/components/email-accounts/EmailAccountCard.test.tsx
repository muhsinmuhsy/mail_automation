import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailAccountCard } from '@/components/email-accounts/EmailAccountCard';

const activeAccount = {
  id: 'a1',
  provider: 'gmail',
  email: 'me@gmail.com',
  is_active: true,
};

const inactiveAccount = { ...activeAccount, id: 'a2', is_active: false };

function handlers(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    onTest: vi.fn(),
    onDeactivate: vi.fn(),
    onReactivate: vi.fn(),
    onEdit: vi.fn(),
    ...overrides,
  };
}

describe('EmailAccountCard', () => {
  it('offers reconnect and disconnect for OAuth accounts without password editing', async () => {
    const onReconnect = vi.fn(); const onDisconnect = vi.fn();
    render(<EmailAccountCard account={{ ...activeAccount, auth_method: 'oauth2' }} {...handlers()} onReconnect={onReconnect} onDisconnect={onDisconnect} />);
    expect(screen.getByText('Connected with Google')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onReconnect).toHaveBeenCalledOnce(); expect(onDisconnect).toHaveBeenCalledOnce();
  });
  it('requires Google reconnection after authorization expires', () => {
    render(<EmailAccountCard account={{ ...inactiveAccount, auth_method: 'oauth2', connection_error: 'reconnect_required' }} {...handlers()} onReconnect={vi.fn()} />);
    expect(screen.getByText(/Authorization expired/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
  });
  it('renders the account email and provider', () => {
    render(<EmailAccountCard account={activeAccount} {...handlers()} />);
    expect(screen.getByText('me@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('gmail')).toBeInTheDocument();
  });

  it('capitalises the provider via CSS', () => {
    render(<EmailAccountCard account={activeAccount} {...handlers()} />);
    expect(screen.getByText('gmail')).toHaveClass('capitalize');
  });

  it('shows an Active status badge for active accounts', () => {
    render(<EmailAccountCard account={activeAccount} {...handlers()} />);
    const badge = screen.getByText('Active');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-success-light');
  });

  it('shows a Cancelled status badge for inactive accounts', () => {
    render(<EmailAccountCard account={inactiveAccount} {...handlers()} />);
    const badge = screen.getByText('Cancelled');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-selected');
  });

  // App password disabled — commented out for future re-enablement
  /*
  it('renders Test, Edit and Deactivate for an active account', () => {
    render(<EmailAccountCard account={activeAccount} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
  });

  it('renders only Reactivate (plus a disabled Test) for an inactive account', () => {
    render(<EmailAccountCard account={inactiveAccount} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });

  it('calls onEdit when Edit is clicked', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<EmailAccountCard account={activeAccount} {...h} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(h.onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onDeactivate when Deactivate is clicked', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<EmailAccountCard account={activeAccount} {...h} />);
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(h.onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('calls onReactivate when Reactivate is clicked', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<EmailAccountCard account={inactiveAccount} {...h} />);
    await user.click(screen.getByRole('button', { name: 'Reactivate' }));
    expect(h.onReactivate).toHaveBeenCalledTimes(1);
  });
  */

  it('calls onTest when Test is clicked', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<EmailAccountCard account={activeAccount} {...h} />);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    expect(h.onTest).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled());
  });

  it('shows a testing state while the test promise is pending and restores it after', async () => {
    const user = userEvent.setup();
    let resolveTest!: () => void;
    const onTest = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTest = resolve;
        })
    );
    render(<EmailAccountCard account={activeAccount} {...handlers({ onTest })} />);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    const pending = screen.getByRole('button', { name: 'Testing...' });
    expect(pending).toBeDisabled();
    await act(async () => {
      resolveTest();
    });
    expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled();
  });

  it('does not call onTest for an inactive account (button disabled)', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<EmailAccountCard account={inactiveAccount} {...h} />);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    expect(h.onTest).not.toHaveBeenCalled();
  });

  // App password disabled — commented out for future re-enablement
  /*
  it('renders the Deactivate button with the destructive variant', () => {
    render(<EmailAccountCard account={activeAccount} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'Deactivate' })).toHaveClass('bg-error');
  });

  it('renders the Reactivate button with the primary variant', () => {
    render(<EmailAccountCard account={inactiveAccount} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'Reactivate' })).toHaveClass('bg-information');
  });

  it('renders all action buttons at the small size', () => {
    render(<EmailAccountCard account={activeAccount} {...handlers()} />);
    for (const name of ['Test', 'Edit', 'Deactivate']) {
      expect(screen.getByRole('button', { name })).toHaveClass('h-8');
    }
  });
  */

  it('lays the card out as a space-between row', () => {
    const { container } = render(<EmailAccountCard account={activeAccount} {...handlers()} />);
    expect(container.firstChild).toHaveClass('p-4', 'flex', 'items-center', 'justify-between');
  });

  it('supports other providers such as custom_smtp', () => {
    render(
      <EmailAccountCard
        account={{ ...activeAccount, provider: 'custom_smtp', email: 'ops@corp.io' }}
        {...handlers()}
      />
    );
    expect(screen.getByText('custom_smtp')).toBeInTheDocument();
    expect(screen.getByText('ops@corp.io')).toBeInTheDocument();
  });
});
