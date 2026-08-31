import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignList } from '@/components/campaigns/CampaignList';

const campaigns = [
  { id: 'c1', name: 'Alpha', status: 'DRAFT' },
  { id: 'c2', name: 'Beta', status: 'ACTIVE' },
  { id: 'c3', name: 'Gamma', status: 'COMPLETED' },
];

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from((container.firstElementChild as HTMLElement).children) as HTMLElement[];
}

describe('CampaignList', () => {
  it('renders one row per campaign', () => {
    const { container } = render(<CampaignList campaigns={campaigns} />);
    expect(rows(container)).toHaveLength(3);
  });

  it('renders every campaign name and status', () => {
    render(<CampaignList campaigns={campaigns} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Status: DRAFT')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Status: ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.getByText('Status: COMPLETED')).toBeInTheDocument();
  });

  it('renders an empty stacked container for an empty list', () => {
    const { container } = render(<CampaignList campaigns={[]} />);
    expect(container.firstChild).toBeEmptyDOMElement();
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('renders a single campaign', () => {
    const { container } = render(<CampaignList campaigns={[campaigns[1]]} />);
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('uses a space-between row layout', () => {
    const { container } = render(<CampaignList campaigns={[campaigns[0]]} />);
    expect(rows(container)[0]).toHaveClass('flex', 'items-center', 'justify-between');
  });

  it('preserves the provided order', () => {
    const { container } = render(<CampaignList campaigns={campaigns} />);
    const names = Array.from(container.querySelectorAll('p.font-medium')).map((p) => p.textContent);
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('renders campaigns that share a name but not an id', () => {
    render(
      <CampaignList
        campaigns={[
          { id: 'x', name: 'Dup', status: 'DRAFT' },
          { id: 'y', name: 'Dup', status: 'ACTIVE' },
        ]}
      />
    );
    expect(screen.getAllByText('Dup')).toHaveLength(2);
  });

  it('renders many campaigns', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `c-${i}`,
      name: `Campaign ${i}`,
      status: 'ACTIVE',
    }));
    const { container } = render(<CampaignList campaigns={many} />);
    expect(rows(container)).toHaveLength(20);
    expect(screen.getByText('Campaign 19')).toBeInTheDocument();
  });
});
