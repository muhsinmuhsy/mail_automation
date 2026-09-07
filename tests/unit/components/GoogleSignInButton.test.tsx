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

  it('posts to the Neon Auth social sign-in endpoint with callbackURL /dashboard', async () => {
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
      body: JSON.stringify({ provider: 'google', callbackURL: '/dashboard' }),
    }));
  });

  it('does not fall back to root callbackURL when dashboard is intended', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: '/dashboard' }),
    } as Response);

    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.callbackURL).toBe('/dashboard');
    expect(body.callbackURL).not.toBe('/');
    expect(body.callbackURL).not.toBeUndefined();
  });

  it('navigates to the OAuth url returned by the server', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://accounts.google.com/o/oauth2/auth?redirect=/dashboard' }),
    } as Response);

    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(window.location.href).toBe('https://accounts.google.com/o/oauth2/auth?redirect=/dashboard'));
  });
});
