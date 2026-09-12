import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignList } from '@/components/campaigns/CampaignList';
import type { CampaignRow } from '@/components/campaigns/CampaignCard';

const campaigns: CampaignRow[] = [
  { id: 'c1', name: 'Alpha', status: 'DRAFT', created_at: '2026-01-01T00:00:00Z', start_at: '2026-01-15T10:00:00Z', timezone: 'UTC', interval_minutes: 5, daily_limit: 100 },
  { id: 'c2', name: 'Beta', status: 'ACTIVE', created_at: '2026-01-02T00:00:00Z', start_at: '2026-01-16T10:00:00Z', timezone: 'UTC', interval_minutes: 10, daily_limit: null },
  { id: 'c3', name: 'Gamma', status: 'COMPLETED', created_at: '2026-01-03T00:00:00Z', start_at: '2026-01-17T10:00:00Z', timezone: 'UTC', interval_minutes: 15, daily_limit: 50 },
];

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from((container.firstElementChild as HTMLElement).children) as HTMLElement[];
}

describe('CampaignList', () => {
  it('renders one row per campaign', () => {
    const { container } = render(<CampaignList campaigns={campaigns} />);
    expect(rows(container)).toHaveLength(3);
  });

  it('renders every campaign name', () => {
    render(<CampaignList campaigns={campaigns} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('renders a divide-y bordered container', () => {
    const { container } = render(<CampaignList campaigns={campaigns} />);
    expect(container.firstChild).toHaveClass('divide-y', 'divide-neutral-200', 'border', 'border-neutral-200', 'bg-background');
  });

  it('renders an empty container for an empty list', () => {
    const { container } = render(<CampaignList campaigns={[]} />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it('renders a single campaign', () => {
    const { container } = render(<CampaignList campaigns={[campaigns[1]]} />);
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('preserves the provided order', () => {
    const { container } = render(<CampaignList campaigns={campaigns} />);
    const names = Array.from(container.querySelectorAll('p.truncate')).map((p) => p.textContent);
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('renders campaigns that share a name but not an id', () => {
    render(
      <CampaignList
        campaigns={[
          { id: 'x', name: 'Dup', status: 'DRAFT', created_at: '2026-01-01T00:00:00Z', start_at: '2026-01-15T10:00:00Z', timezone: 'UTC', interval_minutes: 5, daily_limit: 100 },
          { id: 'y', name: 'Dup', status: 'ACTIVE', created_at: '2026-01-02T00:00:00Z', start_at: '2026-01-16T10:00:00Z', timezone: 'UTC', interval_minutes: 10, daily_limit: null },
        ]}
      />
    );
    expect(screen.getAllByText('Dup')).toHaveLength(2);
  });

  it('renders many campaigns', () => {
    const many: CampaignRow[] = Array.from({ length: 20 }, (_, i) => ({
      id: `c-${i}`,
      name: `Campaign ${i}`,
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00Z',
      start_at: '2026-01-15T10:00:00Z',
      timezone: 'UTC',
      interval_minutes: 5,
      daily_limit: 100,
    }));
    const { container } = render(<CampaignList campaigns={many} />);
    expect(rows(container)).toHaveLength(20);
    expect(screen.getByText('Campaign 19')).toBeInTheDocument();
  });

  it('passes onView callback to cards', () => {
    const onView = vi.fn();
    render(<CampaignList campaigns={campaigns} onView={onView} />);
    expect(screen.getAllByRole('button', { name: 'View details' })).toHaveLength(3);
  });
});
