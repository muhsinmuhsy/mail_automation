import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AdminUserTable } from '@/components/admin/AdminUserTable';

const users = [
  { id: 'u1', email: 'alice@example.com', name: 'Alice Admin', role: 'ADMIN' },
  { id: 'u2', email: 'bob@example.com', name: 'Bob User', role: 'USER' },
  { id: 'u3', email: 'nameless@example.com', name: null, role: 'USER' },
];

describe('AdminUserTable', () => {
  it('renders a table with the three column headers', () => {
    render(<AdminUserTable users={users} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Role' })).toBeInTheDocument();
  });

  it('renders one body row per user', () => {
    const { container } = render(<AdminUserTable users={users} />);
    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(3);
  });

  it('renders each user email, name and role', () => {
    render(<AdminUserTable users={users} />);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('Bob User')).toBeInTheDocument();
    expect(screen.getAllByText('USER')).toHaveLength(2);
  });

  it('renders an empty name cell when name is null', () => {
    const { container } = render(<AdminUserTable users={users} />);
    const row = within(container).getByText('nameless@example.com').closest('tr') as HTMLElement;
    const cells = row.querySelectorAll('td');
    expect(cells).toHaveLength(3);
    expect(cells[1]).toBeEmptyDOMElement();
  });

  it('renders only the header row when there are no users', () => {
    const { container } = render(<AdminUserTable users={[]} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
  });

  it('renders a single row for a single user', () => {
    const { container } = render(<AdminUserTable users={[users[0]]} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('places columns in email, name, role order', () => {
    const { container } = render(<AdminUserTable users={[users[1]]} />);
    const cells = Array.from(container.querySelectorAll('tbody td')).map((c) => c.textContent);
    expect(cells).toEqual(['bob@example.com', 'Bob User', 'USER']);
  });

  it('styles the role cell as secondary text and the email cell as primary', () => {
    const { container } = render(<AdminUserTable users={[users[0]]} />);
    const cells = container.querySelectorAll('tbody td');
    expect(cells[0]).toHaveClass('text-text-primary');
    expect(cells[2]).toHaveClass('text-text-secondary');
  });

  it('renders the outer card container with a border', () => {
    const { container } = render(<AdminUserTable users={[]} />);
    expect(container.firstChild).toHaveClass('border', 'border-neutral-200', 'bg-background');
  });

  it('renders a full-width small-text table', () => {
    render(<AdminUserTable users={[]} />);
    expect(screen.getByRole('table')).toHaveClass('w-full', 'text-sm');
  });

  it('handles a large list of users', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: `id-${i}`,
      email: `user${i}@example.com`,
      name: `User ${i}`,
      role: i % 2 === 0 ? 'USER' : 'ADMIN',
    }));
    const { container } = render(<AdminUserTable users={many} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(25);
    expect(screen.getByText('user24@example.com')).toBeInTheDocument();
  });
});
