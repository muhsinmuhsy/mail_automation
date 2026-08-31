import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InlineFieldError } from '@/components/ui/InlineFieldError';

describe('InlineFieldError', () => {
  it('renders nothing when no message is provided', () => {
    const { container } = render(<InlineFieldError />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when message is an empty string', () => {
    const { container } = render(<InlineFieldError message="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the message when provided', () => {
    render(<InlineFieldError message="Required field" />);
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });
});
