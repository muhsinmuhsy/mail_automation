import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateCard } from '@/components/templates/TemplateCard';

describe('TemplateCard', () => {
  const template = { id: 't1', name: 'Welcome email', subject: 'Welcome aboard!' };

  it('renders the template name', () => {
    render(<TemplateCard template={template} />);
    expect(screen.getByText('Welcome email')).toBeInTheDocument();
  });

  it('renders the template subject', () => {
    render(<TemplateCard template={template} />);
    expect(screen.getByText('Welcome aboard!')).toBeInTheDocument();
  });

  it('emphasises the name and de-emphasises the subject', () => {
    render(<TemplateCard template={template} />);
    expect(screen.getByText('Welcome email')).toHaveClass('font-medium', 'text-text-primary');
    expect(screen.getByText('Welcome aboard!')).toHaveClass('text-sm', 'text-text-secondary');
  });

  it('renders a bordered card container', () => {
    const { container } = render(<TemplateCard template={template} />);
    expect(container.firstChild).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('renders empty name and subject without crashing', () => {
    const { container } = render(<TemplateCard template={{ id: 't2', name: '', subject: '' }} />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toBeEmptyDOMElement();
    expect(paragraphs[1]).toBeEmptyDOMElement();
  });

  it('renders long names and subjects verbatim', () => {
    const name = 'N'.repeat(150);
    const subject = 'S'.repeat(150);
    render(<TemplateCard template={{ id: 't3', name, subject }} />);
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText(subject)).toBeInTheDocument();
  });

  it('renders duplicate names for distinct ids', () => {
    render(
      <TemplateCard template={{ id: 'a', name: 'Dup', subject: 'One' }} />
    );
    render(
      <TemplateCard template={{ id: 'b', name: 'Dup', subject: 'Two' }} />
    );
    expect(screen.getAllByText('Dup')).toHaveLength(2);
  });

  describe('edit', () => {
    it('does not render an edit button when onEdit is not provided', () => {
      render(<TemplateCard template={template} />);
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('renders an edit button when onEdit is provided', () => {
      render(<TemplateCard template={template} onEdit={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('calls onEdit with the template when clicked', async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      render(<TemplateCard template={template} onEdit={onEdit} />);

      await user.click(screen.getByRole('button', { name: 'Edit' }));

      expect(onEdit).toHaveBeenCalledWith(template);
    });
  });

  describe('preview', () => {
    it('does not render a preview button when onPreview is not provided', () => {
      render(<TemplateCard template={template} />);
      expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    });

    it('renders a preview button when onPreview is provided', () => {
      render(<TemplateCard template={template} onPreview={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
    });

    it('calls onPreview with the template when clicked', async () => {
      const user = userEvent.setup();
      const onPreview = vi.fn();
      render(<TemplateCard template={template} onPreview={onPreview} />);

      await user.click(screen.getByRole('button', { name: 'Preview' }));

      expect(onPreview).toHaveBeenCalledWith(template);
    });
  });

  describe('delete', () => {
    it('does not render a delete button when onDelete is not provided', () => {
      render(<TemplateCard template={template} />);
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('renders a destructive delete button when onDelete is provided', () => {
      render(<TemplateCard template={template} onDelete={vi.fn()} />);
      const button = screen.getByRole('button', { name: 'Delete' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('bg-error');
    });

    it('calls onDelete with the template id when clicked', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<TemplateCard template={template} onDelete={onDelete} />);

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(onDelete).toHaveBeenCalledWith('t1');
    });

    it('disables the delete button while deleting', () => {
      render(<TemplateCard template={template} onDelete={vi.fn()} deleting />);
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });
  });

  describe('action button layout', () => {
    it('renders action buttons in a horizontal row', () => {
      render(<TemplateCard template={template} onEdit={vi.fn()} onPreview={vi.fn()} onDelete={vi.fn()} />);
      const editButton = screen.getByRole('button', { name: 'Edit' });
      const previewButton = screen.getByRole('button', { name: 'Preview' });
      const deleteButton = screen.getByRole('button', { name: 'Delete' });
      expect(editButton.parentElement).toHaveClass('flex', 'gap-2');
      expect(previewButton.parentElement).toBe(editButton.parentElement);
      expect(deleteButton.parentElement).toBe(editButton.parentElement);
    });
  });
});
