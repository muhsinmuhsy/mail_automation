import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminCampaignTable } from '@/components/admin/AdminCampaignTable';

describe('AdminCampaignTable', () => {
  it('renders the placeholder copy', () => {
    render(<AdminCampaignTable />);
    expect(screen.getByText('Campaign administration table placeholder.')).toBeInTheDocument();
  });

  it('renders a bordered card container', () => {
    const { container } = render(<AdminCampaignTable />);
    expect(container.firstChild).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('uses the medium radius design token', () => {
    const { container } = render(<AdminCampaignTable />);
    expect((container.firstChild as HTMLElement).className).toContain('rounded-[var(--radius-md)]');
  });

  it('styles the placeholder as small secondary text', () => {
    render(<AdminCampaignTable />);
    expect(screen.getByText('Campaign administration table placeholder.')).toHaveClass(
      'text-sm',
      'text-text-secondary'
    );
  });

  it('does not render an actual table element yet', () => {
    const { container } = render(<AdminCampaignTable />);
    expect(container.querySelector('table')).not.toBeInTheDocument();
  });

  it('renders no interactive controls', () => {
    render(<AdminCampaignTable />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('takes no props and renders deterministically', () => {
    const a = render(<AdminCampaignTable />).container.innerHTML;
    const b = render(<AdminCampaignTable />).container.innerHTML;
    expect(a).toBe(b);
  });
});
