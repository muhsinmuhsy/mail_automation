import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactList } from '@/components/contacts/ContactList';

const contacts = [
  { id: 'k1', name: 'Ann', email: 'ann@example.com' },
  { id: 'k2', name: 'Ben', email: 'ben@example.com' },
  { id: 'k3', name: 'Cara', email: 'cara@example.com' },
];

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from((container.firstElementChild as HTMLElement).children) as HTMLElement[];
}

describe('ContactList', () => {
  it('renders one card per contact', () => {
    const { container } = render(<ContactList contacts={contacts} />);
    expect(rows(container)).toHaveLength(3);
  });

  it('renders each name and email', () => {
    render(<ContactList contacts={contacts} />);
    expect(screen.getByText('Ann')).toBeInTheDocument();
    expect(screen.getByText('ann@example.com')).toBeInTheDocument();
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.getByText('ben@example.com')).toBeInTheDocument();
    expect(screen.getByText('Cara')).toBeInTheDocument();
    expect(screen.getByText('cara@example.com')).toBeInTheDocument();
  });

  it('renders an empty container for an empty list', () => {
    const { container } = render(<ContactList contacts={[]} />);
    expect(container.firstChild).toBeEmptyDOMElement();
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('renders a single contact', () => {
    const { container } = render(<ContactList contacts={[contacts[0]]} />);
    expect(rows(container)).toHaveLength(1);
  });

  it('renders each row as a bordered card', () => {
    const { container } = render(<ContactList contacts={[contacts[0]]} />);
    expect(rows(container)[0]).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('preserves the provided order', () => {
    const { container } = render(<ContactList contacts={contacts} />);
    const names = Array.from(container.querySelectorAll('p.font-medium')).map((p) => p.textContent);
    expect(names).toEqual(['Ann', 'Ben', 'Cara']);
  });

  it('handles contacts with identical names', () => {
    render(
      <ContactList
        contacts={[
          { id: 'a', name: 'Same', email: 'a@example.com' },
          { id: 'b', name: 'Same', email: 'b@example.com' },
        ]}
      />
    );
    expect(screen.getAllByText('Same')).toHaveLength(2);
  });

  it('renders many contacts', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `k-${i}`,
      name: `Contact ${i}`,
      email: `c${i}@example.com`,
    }));
    const { container } = render(<ContactList contacts={many} />);
    expect(rows(container)).toHaveLength(40);
    expect(screen.getByText('Contact 39')).toBeInTheDocument();
  });
});
