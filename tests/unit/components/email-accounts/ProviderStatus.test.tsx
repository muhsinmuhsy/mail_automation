import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderStatus } from '@/components/email-accounts/ProviderStatus';

describe('ProviderStatus', () => {
  it('renders an Active badge when connected', () => {
    render(<ProviderStatus connected />);
    const badge = screen.getByText('Active');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-success-light');
  });

  it('renders a Failed badge when not connected', () => {
    render(<ProviderStatus connected={false} />);
    const badge = screen.getByText('Failed');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-error-light');
  });

  it('omits the last-checked text when lastChecked is not provided', () => {
    render(<ProviderStatus connected />);
    expect(screen.queryByText(/Last checked:/)).not.toBeInTheDocument();
  });

  it('renders a localised last-checked timestamp when provided', () => {
    const iso = '2026-03-04T10:20:30.000Z';
    render(<ProviderStatus connected lastChecked={iso} />);
    const expected = `Last checked: ${new Date(iso).toLocaleString()}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('styles the last-checked text as small secondary text', () => {
    render(<ProviderStatus connected lastChecked="2026-03-04T10:20:30.000Z" />);
    expect(screen.getByText(/Last checked:/)).toHaveClass('text-sm', 'text-text-secondary');
  });

  it('renders the timestamp for a disconnected provider too', () => {
    render(<ProviderStatus connected={false} lastChecked="2026-01-01T00:00:00.000Z" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/Last checked:/)).toBeInTheDocument();
  });

  it('treats an empty lastChecked string as absent', () => {
    render(<ProviderStatus connected lastChecked="" />);
    expect(screen.queryByText(/Last checked:/)).not.toBeInTheDocument();
  });

  it('renders "Invalid Date" for an unparsable timestamp', () => {
    render(<ProviderStatus connected lastChecked="not-a-date" />);
    expect(screen.getByText(/Last checked:/).textContent).toContain('Invalid Date');
  });

  it('lays out badge and timestamp in a horizontal row', () => {
    const { container } = render(<ProviderStatus connected lastChecked="2026-01-01T00:00:00.000Z" />);
    expect(container.firstChild).toHaveClass('flex', 'items-center', 'gap-3');
    expect((container.firstElementChild as HTMLElement).children).toHaveLength(2);
  });

  it('renders only the badge when there is no timestamp', () => {
    const { container } = render(<ProviderStatus connected={false} />);
    expect((container.firstElementChild as HTMLElement).children).toHaveLength(1);
  });
});
