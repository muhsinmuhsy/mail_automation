import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateList } from '@/components/templates/TemplateList';

const templates = [
  { id: 't1', name: 'Welcome', subject: 'Welcome aboard!' },
  { id: 't2', name: 'Follow-up', subject: 'Just following up' },
  { id: 't3', name: 'Rejection', subject: 'Thanks for applying' },
];

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from((container.firstElementChild as HTMLElement).children) as HTMLElement[];
}

describe('TemplateList', () => {
  it('renders one card per template', () => {
    const { container } = render(<TemplateList templates={templates} />);
    expect(rows(container)).toHaveLength(3);
  });

  it('renders each name and subject', () => {
    render(<TemplateList templates={templates} />);
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('Welcome aboard!')).toBeInTheDocument();
    expect(screen.getByText('Follow-up')).toBeInTheDocument();
    expect(screen.getByText('Just following up')).toBeInTheDocument();
    expect(screen.getByText('Rejection')).toBeInTheDocument();
    expect(screen.getByText('Thanks for applying')).toBeInTheDocument();
  });

  it('renders an empty grid container for no templates', () => {
    const { container } = render(<TemplateList templates={[]} />);
    expect(container.firstChild).toBeEmptyDOMElement();
    expect(container.firstChild).toHaveClass('grid');
  });

  it('renders a single template', () => {
    const { container } = render(<TemplateList templates={[templates[0]]} />);
    expect(rows(container)).toHaveLength(1);
  });

  it('renders each row as a bordered card', () => {
    const { container } = render(<TemplateList templates={[templates[0]]} />);
    expect(rows(container)[0]).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('emphasises the name and de-emphasises the subject', () => {
    render(<TemplateList templates={[templates[0]]} />);
    expect(screen.getByText('Welcome')).toHaveClass('font-medium', 'text-text-primary');
    expect(screen.getByText('Welcome aboard!')).toHaveClass('text-sm', 'text-text-secondary');
  });

  it('preserves the provided order', () => {
    const { container } = render(<TemplateList templates={templates} />);
    const names = Array.from(container.querySelectorAll('p.font-medium')).map((p) => p.textContent);
    expect(names).toEqual(['Welcome', 'Follow-up', 'Rejection']);
  });

  it('renders templates that share a name', () => {
    render(
      <TemplateList
        templates={[
          { id: 'a', name: 'Shared', subject: 'A' },
          { id: 'b', name: 'Shared', subject: 'B' },
        ]}
      />
    );
    expect(screen.getAllByText('Shared')).toHaveLength(2);
  });

  it('renders many templates', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: `t-${i}`,
      name: `Template ${i}`,
      subject: `Subject ${i}`,
    }));
    const { container } = render(<TemplateList templates={many} />);
    expect(rows(container)).toHaveLength(25);
    expect(screen.getByText('Template 24')).toBeInTheDocument();
  });

  describe('delete', () => {
    it('passes onDelete to each card', () => {
      render(<TemplateList templates={templates} onDelete={vi.fn()} />);
      expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(3);
    });

    it('calls onDelete with the correct id when a delete button is clicked', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<TemplateList templates={templates} onDelete={onDelete} />);

      const buttons = screen.getAllByRole('button', { name: 'Delete' });
      await user.click(buttons[1]);

      expect(onDelete).toHaveBeenCalledWith('t2');
    });

    it('only disables the delete button for the targeted template', () => {
      render(
        <TemplateList
          templates={templates}
          onDelete={vi.fn()}
          deleting
          deletingId="t2"
        />
      );
      const buttons = screen.getAllByRole('button', { name: 'Delete' });
      expect(buttons[0]).not.toBeDisabled();
      expect(buttons[1]).toBeDisabled();
      expect(buttons[2]).not.toBeDisabled();
    });
  });
});
