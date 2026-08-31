import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailAccountList } from '@/components/email-accounts/EmailAccountList';

const accounts = [
  { id: 'a1', provider: 'gmail', email: 'one@gmail.com', is_active: true },
  { id: 'a2', provider: 'microsoft', email: 'two@outlook.com', is_active: false },
  { id: 'a3', provider: 'custom_smtp', email: 'three@corp.io', is_active: true },
];

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from((container.firstElementChild as HTMLElement).children) as HTMLElement[];
}

describe('EmailAccountList', () => {
  it('renders one card per account', () => {
    const { container } = render(<EmailAccountList accounts={accounts} />);
    expect(rows(container)).toHaveLength(3);
  });

  it('renders each account email and provider', () => {
    render(<EmailAccountList accounts={accounts} />);
    expect(screen.getByText('one@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('gmail')).toBeInTheDocument();
    expect(screen.getByText('two@outlook.com')).toBeInTheDocument();
    expect(screen.getByText('microsoft')).toBeInTheDocument();
    expect(screen.getByText('three@corp.io')).toBeInTheDocument();
    expect(screen.getByText('custom_smtp')).toBeInTheDocument();
  });

  it('does not surface the active flag in this list view', () => {
    render(<EmailAccountList accounts={accounts} />);
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
  });

  it('renders an empty container for no accounts', () => {
    const { container } = render(<EmailAccountList accounts={[]} />);
    expect(container.firstChild).toBeEmptyDOMElement();
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('renders a single account', () => {
    const { container } = render(<EmailAccountList accounts={[accounts[0]]} />);
    expect(rows(container)).toHaveLength(1);
  });

  it('renders each row as a bordered card', () => {
    const { container } = render(<EmailAccountList accounts={[accounts[0]]} />);
    expect(rows(container)[0]).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('emphasises the email and de-emphasises the provider', () => {
    render(<EmailAccountList accounts={[accounts[0]]} />);
    expect(screen.getByText('one@gmail.com')).toHaveClass('font-medium', 'text-text-primary');
    expect(screen.getByText('gmail')).toHaveClass('text-sm', 'text-text-secondary');
  });

  it('preserves the provided order', () => {
    const { container } = render(<EmailAccountList accounts={accounts} />);
    const emails = Array.from(container.querySelectorAll('p.font-medium')).map((p) => p.textContent);
    expect(emails).toEqual(['one@gmail.com', 'two@outlook.com', 'three@corp.io']);
  });

  it('renders inactive accounts alongside active ones', () => {
    const { container } = render(
      <EmailAccountList accounts={accounts.filter((a) => !a.is_active)} />
    );
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByText('two@outlook.com')).toBeInTheDocument();
  });
});
