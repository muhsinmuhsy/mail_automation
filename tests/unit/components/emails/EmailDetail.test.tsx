import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailDetail } from '@/components/emails/EmailDetail';

const email = {
  id: 'e1',
  subject: 'Follow-up on my application',
  to_email: 'hiring@example.com',
  status: 'SENT',
  body: 'Hello,\n\nThanks for your time.\n\nBest,\nAlice',
};

describe('EmailDetail', () => {
  it('renders the subject as a heading', () => {
    render(<EmailDetail email={email} />);
    const heading = screen.getByRole('heading', { name: 'Follow-up on my application' });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H3');
  });

  it('renders the recipient prefixed with "To:"', () => {
    render(<EmailDetail email={email} />);
    expect(screen.getByText('To: hiring@example.com')).toBeInTheDocument();
  });

  it('renders the email body', () => {
    const { container } = render(<EmailDetail email={email} />);
    const bodyEl = container.querySelector('.whitespace-pre-wrap') as HTMLElement;
    expect(bodyEl).toBeInTheDocument();
    expect(bodyEl.textContent).toBe(email.body);
  });

  it('preserves newlines in the body via whitespace-pre-wrap', () => {
    const { container } = render(<EmailDetail email={email} />);
    expect(container.querySelector('.whitespace-pre-wrap')).toHaveClass(
      'text-sm',
      'text-text-primary'
    );
  });

  it('renders the body inside a bordered panel', () => {
    const { container } = render(<EmailDetail email={email} />);
    const panel = container.querySelector('.whitespace-pre-wrap')?.parentElement as HTMLElement;
    expect(panel).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('renders an empty body without crashing', () => {
    const { container } = render(<EmailDetail email={{ ...email, body: '' }} />);
    expect(container.querySelector('.whitespace-pre-wrap')).toBeEmptyDOMElement();
  });

  it('renders a stacked flex column layout', () => {
    const { container } = render(<EmailDetail email={email} />);
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('does not display the status field', () => {
    render(<EmailDetail email={email} />);
    expect(screen.queryByText('SENT')).not.toBeInTheDocument();
  });

  it('renders HTML-looking bodies as plain text (no injection)', () => {
    const body = '<script>alert(1)</script><b>bold</b>';
    const { container } = render(<EmailDetail email={{ ...email, body }} />);
    const bodyEl = container.querySelector('.whitespace-pre-wrap') as HTMLElement;
    expect(bodyEl.textContent).toBe(body);
    expect(bodyEl.querySelector('b')).not.toBeInTheDocument();
    expect(bodyEl.querySelector('script')).not.toBeInTheDocument();
  });
});
