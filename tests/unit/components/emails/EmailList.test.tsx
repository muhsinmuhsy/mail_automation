import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailList } from '@/components/emails/EmailList';

const emails = [
  { id: 'e1', subject: 'First subject', to_email: 'one@example.com', status: 'SENT' },
  { id: 'e2', subject: 'Second subject', to_email: 'two@example.com', status: 'FAILED' },
  { id: 'e3', subject: 'Third subject', to_email: 'three@example.com', status: 'QUEUED' },
];

function rows(container: HTMLElement): HTMLElement[] {
  const root = container.firstElementChild as HTMLElement;
  return Array.from(root.children) as HTMLElement[];
}

describe('EmailList', () => {
  it('renders one row per email', () => {
    const { container } = render(<EmailList emails={emails} />);
    expect(rows(container)).toHaveLength(3);
  });

  it('renders subject, recipient and status for each email', () => {
    render(<EmailList emails={emails} />);
    expect(screen.getByText('First subject')).toBeInTheDocument();
    expect(screen.getByText('one@example.com')).toBeInTheDocument();
    expect(screen.getByText('SENT')).toBeInTheDocument();
    expect(screen.getByText('Second subject')).toBeInTheDocument();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
    expect(screen.getByText('QUEUED')).toBeInTheDocument();
  });

  it('renders an empty container when there are no emails', () => {
    const { container } = render(<EmailList emails={[]} />);
    expect(container.firstChild).toBeEmptyDOMElement();
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('renders a single email', () => {
    const { container } = render(<EmailList emails={[emails[0]]} />);
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByText('First subject')).toBeInTheDocument();
  });

  it('uses a row layout with the status pushed to the end', () => {
    const { container } = render(<EmailList emails={[emails[0]]} />);
    expect(rows(container)[0]).toHaveClass('flex', 'items-center', 'justify-between');
  });

  it('styles the status as small secondary text', () => {
    render(<EmailList emails={[emails[0]]} />);
    expect(screen.getByText('SENT')).toHaveClass('text-xs', 'font-medium', 'text-text-secondary');
  });

  it('keeps the emails in the order provided', () => {
    const { container } = render(<EmailList emails={emails} />);
    const subjects = Array.from(container.querySelectorAll('p.font-medium')).map(
      (p) => p.textContent
    );
    expect(subjects).toEqual(['First subject', 'Second subject', 'Third subject']);
  });

  it('renders duplicated subjects for distinct ids', () => {
    render(
      <EmailList
        emails={[
          { id: 'a', subject: 'Same', to_email: 'a@example.com', status: 'SENT' },
          { id: 'b', subject: 'Same', to_email: 'b@example.com', status: 'SENT' },
        ]}
      />
    );
    expect(screen.getAllByText('Same')).toHaveLength(2);
  });

  it('renders many emails', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `e-${i}`,
      subject: `Subject ${i}`,
      to_email: `user${i}@example.com`,
      status: 'SENT',
    }));
    const { container } = render(<EmailList emails={many} />);
    expect(rows(container)).toHaveLength(30);
  });
});
