import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactCard } from '@/components/contacts/ContactCard';

describe('ContactCard', () => {
  const contact = { id: 'k1', name: 'Jane Doe', email: 'jane@example.com', company: 'Acme' };

  it('renders the contact name', () => {
    render(<ContactCard contact={contact} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('renders the contact email', () => {
    render(<ContactCard contact={contact} />);
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('does not render the optional company on the card', () => {
    render(<ContactCard contact={contact} />);
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
  });

  it('renders without an optional company field', () => {
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
      expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    });

    it('renders a delete button when onDelete is provided', () => {
      render(<ContactCard contact={contact} onDelete={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Delete Jane Doe' })).toBeInTheDocument();
    });

    it('does not call onDelete when the delete button is clicked without confirming', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<ContactCard contact={contact} onDelete={onDelete} />);

      await user.click(screen.getByRole('button', { name: 'Delete Jane Doe' }));

      expect(onDelete).not.toHaveBeenCalled();
    });

    it('opens a confirmation dialog when the delete button is clicked', async () => {
      const user = userEvent.setup();
      render(<ContactCard contact={contact} onDelete={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'Delete Jane Doe' }));

      expect(screen.getByText('Delete contact')).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to delete Jane Doe\?/)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('calls onDelete with the contact id when confirmed', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<ContactCard contact={contact} onDelete={onDelete} />);

      await user.click(screen.getByRole('button', { name: 'Delete Jane Doe' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(onDelete).toHaveBeenCalledWith('k1');
    });

    it('does not call onDelete when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<ContactCard contact={contact} onDelete={onDelete} />);

      await user.click(screen.getByRole('button', { name: 'Delete Jane Doe' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onDelete).not.toHaveBeenCalled();
    });

    it('disables the delete button while deleting', () => {
      render(<ContactCard contact={contact} onDelete={vi.fn()} deleting />);
      expect(screen.getByRole('button', { name: 'Delete Jane Doe' })).toBeDisabled();
    });
  });
});
