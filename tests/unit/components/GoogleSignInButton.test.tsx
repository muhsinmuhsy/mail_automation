import { describe, it, expect } from 'vitest';
import GoogleSignInButton from '@/components/ui/GoogleSignInButton';

describe('GoogleSignInButton', () => {
  it('returns a form element with correct attributes', () => {
    const result = GoogleSignInButton();
    expect(result.type).toBe('form');
    expect(result.props.action).toBe('/api/auth/sign-in/social');
    expect(result.props.method).toBe('POST');
  });

  it('includes hidden provider input with google value', () => {
    const result = GoogleSignInButton();
    const hiddenInput = result.props.children[0];
    expect(hiddenInput.props.type).toBe('hidden');
    expect(hiddenInput.props.name).toBe('provider');
    expect(hiddenInput.props.value).toBe('google');
  });

  it('renders a submit button with Continue with Google text', () => {
    const result = GoogleSignInButton();
    const button = result.props.children[1];
    expect(button.type).toBe('button');
    expect(button.props.children).toContain('Continue with Google');
  });
});
