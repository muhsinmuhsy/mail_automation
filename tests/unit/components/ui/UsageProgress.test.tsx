import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageProgress } from '@/components/ui/UsageProgress';

describe('UsageProgress', () => {
  it('shows used, limit, and remaining', () => {
    render(<UsageProgress sent={10} reserved={5} limit={50} />);
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText(/of 50/)).toBeInTheDocument();
    expect(screen.getByText(/35 remaining/)).toBeInTheDocument();
  });

  it('shows in-progress count when reserved > 0', () => {
    render(<UsageProgress sent={10} reserved={5} limit={50} />);
    expect(screen.getByText(/35 remaining \(5 in progress\)/)).toBeInTheDocument();
  });

  it('omits in-progress note when reserved is 0', () => {
    render(<UsageProgress sent={10} reserved={0} limit={50} />);
    expect(screen.getByText(/40 remaining\./)).toBeInTheDocument();
    expect(screen.queryByText(/in progress/)).toBeNull();
  });

  it('shows "Limit reached" badge when remaining is 0', () => {
    render(<UsageProgress sent={45} reserved={5} limit={50} />);
    expect(screen.getByText('Limit reached')).toBeInTheDocument();
  });

  it('shows "Near limit" badge when usage >= 80%', () => {
    render(<UsageProgress sent={38} reserved={2} limit={50} />);
    expect(screen.getByText('Near limit')).toBeInTheDocument();
  });

  it('shows no badge when usage < 80%', () => {
    render(<UsageProgress sent={10} reserved={5} limit={50} />);
    expect(screen.queryByText('Limit reached')).toBeNull();
    expect(screen.queryByText('Near limit')).toBeNull();
  });

  it('uses custom label when provided', () => {
    render(<UsageProgress sent={0} reserved={0} limit={100} label="Campaign daily usage" />);
    expect(screen.getByText('Campaign daily usage')).toBeInTheDocument();
  });

  it('defaults label to "Daily email usage"', () => {
    render(<UsageProgress sent={0} reserved={0} limit={100} />);
    expect(screen.getByText('Daily email usage')).toBeInTheDocument();
  });

  it('clamps percentage to 100 when over limit', () => {
    const { container } = render(<UsageProgress sent={60} reserved={0} limit={50} />);
    const bar = container.querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('handles zero limit without crashing', () => {
    render(<UsageProgress sent={0} reserved={0} limit={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText(/of 0/)).toBeInTheDocument();
  });
});
