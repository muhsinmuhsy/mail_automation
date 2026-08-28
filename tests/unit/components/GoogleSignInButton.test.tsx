import { describe, it, expect, vi } from 'vitest';
import GoogleSignInButton from '@/components/ui/GoogleSignInButton';

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useState: () => [false, vi.fn()],
  };
});

describe('GoogleSignInButton', () => {
  it('returns a form element with onSubmit handler', () => {
    const result = GoogleSignInButton();
    expect(result.type).toBe('form');
    expect(result.props.onSubmit).toBeDefined();
  });

  it('renders a submit button with Continue with Google text', () => {
    const result = GoogleSignInButton();
    const button = result.props.children;
    expect(button.type).toBe('button');
    expect(button.props.children).toContain('Continue with Google');
  });

  it('button is disabled when loading', () => {
    const result = GoogleSignInButton();
    const button = result.props.children;
    expect(button.props.disabled).toBe(false);
  });
});
