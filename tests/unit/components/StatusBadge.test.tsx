import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/ui/StatusBadge';

describe('StatusBadge', () => {
  const cases: Array<[string, string, string]> = [
    ['SCHEDULED', 'Scheduled', 'information'],
    ['QUEUED', 'Queued', 'information'],
    ['PROCESSING', 'Sending', 'warning'],
    ['RETRY_WAIT', 'Waiting to retry', 'warning'],
    ['SENT', 'Sent', 'success'],
    ['FAILED', 'Failed', 'error'],
    ['CANCELLED', 'Cancelled', 'default'],
    ['DELIVERY_UNKNOWN', 'Delivery status unknown', 'warning'],
    ['DRAFT', 'Draft', 'default'],
    ['ACTIVE', 'Active', 'success'],
    ['PAUSED', 'Paused', 'warning'],
    ['COMPLETED', 'Completed', 'success'],
  ];

  it.each(cases)('maps %s to label "%s" with variant %s', (status, label, variant) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    const span = container.querySelector('span') as HTMLElement;
    expect(span.className).toContain(`bg-${variant === 'default' ? 'selected' : `${variant}-light`}`);
  });

  it('falls back to the raw status as label and default variant for unknown statuses', () => {
    const { container } = render(<StatusBadge status="MYSTERY" />);
    expect(screen.getByText('MYSTERY')).toBeInTheDocument();
    const span = container.querySelector('span') as HTMLElement;
    expect(span.className).toContain('bg-selected');
  });

  it('includes a non-color marker alongside the status label', () => {
    render(<StatusBadge status="SENT" />);
    expect(screen.getByText('OK')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });
});
