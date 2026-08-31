import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignCard } from '@/components/campaigns/CampaignCard';

describe('CampaignCard', () => {
  const campaign = { id: 'c1', name: 'Spring outreach', status: 'ACTIVE' };

  it('renders the campaign name', () => {
    render(<CampaignCard campaign={campaign} />);
    expect(screen.getByText('Spring outreach')).toBeInTheDocument();
  });

  it('renders the status with a "Status:" prefix', () => {
    render(<CampaignCard campaign={campaign} />);
    expect(screen.getByText('Status: ACTIVE')).toBeInTheDocument();
  });

  it('emphasises the name and de-emphasises the status', () => {
    render(<CampaignCard campaign={campaign} />);
    expect(screen.getByText('Spring outreach')).toHaveClass('font-medium', 'text-text-primary');
    expect(screen.getByText('Status: ACTIVE')).toHaveClass('text-sm', 'text-text-secondary');
  });

  it('renders a bordered card container', () => {
    const { container } = render(<CampaignCard campaign={campaign} />);
    expect(container.firstChild).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it.each(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'])('renders the %s status', (status) => {
    render(<CampaignCard campaign={{ ...campaign, status }} />);
    expect(screen.getByText(`Status: ${status}`)).toBeInTheDocument();
  });

  it('renders an empty name without crashing', () => {
    const { container } = render(<CampaignCard campaign={{ id: 'c2', name: '', status: 'DRAFT' }} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelectorAll('p')[0]).toBeEmptyDOMElement();
  });

  it('renders long names verbatim', () => {
    const name = 'N'.repeat(200);
    render(<CampaignCard campaign={{ ...campaign, name }} />);
    expect(screen.getByText(name)).toBeInTheDocument();
  });
});
