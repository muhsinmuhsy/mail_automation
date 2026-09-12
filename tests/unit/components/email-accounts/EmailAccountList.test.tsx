import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailAccountList } from '@/components/email-accounts/EmailAccountList';

const accounts = [
  { id: 'a1', provider: 'gmail', email: 'one@gmail.com', is_active: true, auth_method: 'oauth2' },
  { id: 'a2', provider: 'gmail', email: 'two@gmail.com', is_active: false, auth_method: 'oauth2' },
  { id: 'a3', provider: 'gmail', email: 'three@gmail.com', is_active: true, auth_method: 'oauth2' },
];

const handlers = {
  onTest: vi.fn(),
  onDeactivate: vi.fn(),
  onReactivate: vi.fn(),
  onReconnect: vi.fn(),
  onDisconnect: vi.fn(),
};

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from((container.firstElementChild as HTMLElement).children) as HTMLElement[];
}

describe('EmailAccountList', () => {
  it('renders one card per account', () => {
    const { container } = render(<EmailAccountList accounts={accounts} {...handlers} />);
    expect(rows(container)).toHaveLength(3);
  });

  it('renders each account email', () => {
    render(<EmailAccountList accounts={accounts} {...handlers} />);
    expect(screen.getByText('one@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('two@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('three@gmail.com')).toBeInTheDocument();
  });

  it('renders a divide-y container', () => {
    const { container } = render(<EmailAccountList accounts={accounts} {...handlers} />);
    expect(container.firstChild).toHaveClass('divide-y', 'divide-neutral-200');
  });

  it('renders an empty container for no accounts', () => {
    const { container } = render(<EmailAccountList accounts={[]} {...handlers} />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it('renders a single account', () => {
    const { container } = render(<EmailAccountList accounts={[accounts[0]]} {...handlers} />);
    expect(rows(container)).toHaveLength(1);
  });

  it('preserves the provided order', () => {
    const { container } = render(<EmailAccountList accounts={accounts} {...handlers} />);
    const emails = Array.from(container.querySelectorAll('p.font-medium')).map((p) => p.textContent);
    expect(emails).toEqual(['one@gmail.com', 'two@gmail.com', 'three@gmail.com']);
  });

  it('renders inactive accounts alongside active ones', () => {
    const { container } = render(
      <EmailAccountList accounts={accounts.filter((a) => !a.is_active)} {...handlers} />
    );
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByText('two@gmail.com')).toBeInTheDocument();
  });
});
