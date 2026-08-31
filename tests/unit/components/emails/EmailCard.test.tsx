import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailCard } from '@/components/emails/EmailCard';

const email = {
  id: 'e1',
  subject: 'Application for Frontend Engineer',
  to_email: 'recruiter@example.com',
  status: 'SENT',
};

describe('EmailCard', () => {
  it('renders the email subject', () => {
    render(<EmailCard email={email} />);
    expect(screen.getByText('Application for Frontend Engineer')).toBeInTheDocument();
  });

  it('renders the recipient address', () => {
    render(<EmailCard email={email} />);
    expect(screen.getByText('recruiter@example.com')).toBeInTheDocument();
  });

  it('emphasises the subject and de-emphasises the recipient', () => {
    render(<EmailCard email={email} />);
    expect(screen.getByText('Application for Frontend Engineer')).toHaveClass(
      'font-medium',
      'text-text-primary'
    );
    expect(screen.getByText('recruiter@example.com')).toHaveClass('text-sm', 'text-text-secondary');
  });

  it('renders a bordered card container', () => {
    const { container } = render(<EmailCard email={email} />);
    expect(container.firstChild).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('does not display the raw status on the card', () => {
    render(<EmailCard email={email} />);
    expect(screen.queryByText('SENT')).not.toBeInTheDocument();
  });

  it('renders an empty subject without crashing', () => {
    const { container } = render(
      <EmailCard email={{ ...email, subject: '', to_email: '' }} />
    );
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelectorAll('p')[0]).toBeEmptyDOMElement();
  });

  it('renders long subjects verbatim', () => {
    const longSubject = 'S'.repeat(300);
    render(<EmailCard email={{ ...email, subject: longSubject }} />);
    expect(screen.getByText(longSubject)).toBeInTheDocument();
  });

  it.each(['SENT', 'FAILED', 'QUEUED', 'SCHEDULED'])(
    'renders the same layout regardless of status (%s)',
    (status) => {
      const { container } = render(<EmailCard email={{ ...email, status }} />);
      expect(container.querySelectorAll('p')).toHaveLength(2);
    }
  );
});
