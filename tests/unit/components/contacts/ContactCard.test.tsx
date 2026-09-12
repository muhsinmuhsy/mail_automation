import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactCard } from '@/components/contacts/ContactCard';

describe('ContactCard', () => {
  const contact = { id: 'k1', name: 'Jane Doe', email: 'jane@example.com' };

  it('renders the contact name', () => {
    render(<ContactCard contact={contact} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('renders the contact email', () => {
    render(<ContactCard contact={contact} />);
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('renders a contact with only name and email', () => {
    const { container } = render(
      <ContactCard contact={{ id: 'k2', name: 'No Company', email: 'nc@example.com' }} />
    );
    expect(screen.getByText('No Company')).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('emphasises the name and de-emphasises the email', () => {
    render(<ContactCard contact={contact} />);
    expect(screen.getByText('Jane Doe')).toHaveClass('font-medium', 'text-text-primary');
    expect(screen.getByText('jane@example.com')).toHaveClass('text-sm', 'text-text-secondary');
  });

  it('renders a bordered card container', () => {
    const { container } = render(<ContactCard contact={contact} />);
    expect(container.firstChild).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('renders empty strings without crashing', () => {
    const { container } = render(<ContactCard contact={{ id: 'k3', name: '', email: '' }} />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toBeEmptyDOMElement();
    expect(paragraphs[1]).toBeEmptyDOMElement();
  });

  it('renders unicode names verbatim', () => {
    render(<ContactCard contact={{ id: 'k4', name: 'Renée Löwe 李雷', email: 'r@example.com' }} />);
    expect(screen.getByText('Renée Löwe 李雷')).toBeInTheDocument();
  });

  describe('delete', () => {
    it('does not render a delete button when onDelete is not provided', () => {
      render(<ContactCard contact={contact} />);
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('renders a destructive delete button when onDelete is provided', () => {
      render(<ContactCard contact={contact} onDelete={vi.fn()} />);
      const button = screen.getByRole('button', { name: 'Delete' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('bg-error');
    });

    it('calls onDelete with the contact id when clicked', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<ContactCard contact={contact} onDelete={onDelete} />);

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(onDelete).toHaveBeenCalledWith('k1');
    });

    it('disables the delete button while deleting', () => {
      render(<ContactCard contact={contact} onDelete={vi.fn()} deleting />);
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });
  });

  describe('view', () => {
    it('does not render a view button when onView is not provided', () => {
      render(<ContactCard contact={contact} />);
      expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
    });

    it('renders a view button when onView is provided', () => {
      render(<ContactCard contact={contact} onView={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    });

    it('calls onView with the contact id when clicked', async () => {
      const user = userEvent.setup();
      const onView = vi.fn();
      render(<ContactCard contact={contact} onView={onView} />);

      await user.click(screen.getByRole('button', { name: 'View' }));

      expect(onView).toHaveBeenCalledWith('k1');
    });
  });

  describe('edit', () => {
    it('does not render an edit button when onEdit is not provided', () => {
      render(<ContactCard contact={contact} />);
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('renders an edit button when onEdit is provided', () => {
      render(<ContactCard contact={contact} onEdit={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('calls onEdit with the contact id when clicked', async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      render(<ContactCard contact={contact} onEdit={onEdit} />);

      await user.click(screen.getByRole('button', { name: 'Edit' }));

      expect(onEdit).toHaveBeenCalledWith('k1');
    });
  });

  describe('action button layout', () => {
    it('renders action buttons in a horizontal row', () => {
      render(<ContactCard contact={contact} onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
      const viewButton = screen.getByRole('button', { name: 'View' });
      const editButton = screen.getByRole('button', { name: 'Edit' });
      const deleteButton = screen.getByRole('button', { name: 'Delete' });
      expect(viewButton.parentElement).toHaveClass('flex', 'gap-2');
      expect(editButton.parentElement).toBe(viewButton.parentElement);
      expect(deleteButton.parentElement).toBe(viewButton.parentElement);
    });
  });

  describe('custom fields', () => {
    it('renders custom field label/value pairs', () => {
      render(
        <ContactCard
          contact={{ id: 'k1', name: 'Jane', email: 'jane@example.com', custom_fields: { t_shirt_size: 'M', score: '42' } }}
          fieldLabels={{ t_shirt_size: 'T-shirt size', score: 'Score' }}
        />
      );
      expect(screen.getByText('T-shirt size:')).toBeInTheDocument();
      expect(screen.getByText('M')).toBeInTheDocument();
      expect(screen.getByText('Score:')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('filters out null and empty custom field values', () => {
      render(
        <ContactCard
          contact={{ id: 'k1', name: 'Jane', email: 'jane@example.com', custom_fields: { size: 'M', empty: '', nullable: null } }}
          fieldLabels={{ size: 'Size', empty: 'Empty', nullable: 'Nullable' }}
        />
      );
      expect(screen.getByText('Size:')).toBeInTheDocument();
      expect(screen.queryByText('Empty:')).not.toBeInTheDocument();
      expect(screen.queryByText('Nullable:')).not.toBeInTheDocument();
    });

    it('shows raw token as label when fieldLabels is not provided', () => {
      render(
        <ContactCard
          contact={{ id: 'k1', name: 'Jane', email: 'jane@example.com', custom_fields: { t_shirt_size: 'M' } }}
        />
      );
      expect(screen.getByText('t_shirt_size:')).toBeInTheDocument();
    });

    it('does not render custom fields section when custom_fields is undefined', () => {
      const { container } = render(<ContactCard contact={{ id: 'k1', name: 'Jane', email: 'jane@example.com' }} />);
      expect(container.querySelector('dl')).not.toBeInTheDocument();
    });
  });
});
