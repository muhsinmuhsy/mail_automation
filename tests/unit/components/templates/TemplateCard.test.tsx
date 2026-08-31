import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
