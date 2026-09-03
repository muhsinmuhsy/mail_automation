import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GoogleSignInButton from '@/components/ui/GoogleSignInButton';

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  it('renders a submit button with Continue with Google text', () => {
    render(<GoogleSignInButton />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('posts to the Neon Auth social sign-in endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: '/dashboard' }),
    } as Response);

    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-in/social', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider: 'google' }),
    }));
  });
});
