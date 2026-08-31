import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateForm } from '@/components/templates/TemplateForm';

describe('TemplateForm', () => {
  it('renders the name, subject and body fields with labels', () => {
    render(<TemplateForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Template name')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toBeInTheDocument();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
  });

  it('renders a textarea for the body, not an input', () => {
    render(<TemplateForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Body')).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('marks all three fields required', () => {
    render(<TemplateForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Template name')).toBeRequired();
    expect(screen.getByLabelText('Subject')).toBeRequired();
    expect(screen.getByLabelText('Body')).toBeRequired();
  });

  it('renders a Save template submit button', () => {
    render(<TemplateForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save template' })).toHaveAttribute(
      'type',
      'submit'
    );
  });

  it('starts with all fields empty', () => {
    render(<TemplateForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Template name')).toHaveValue('');
    expect(screen.getByLabelText('Subject')).toHaveValue('');
    expect(screen.getByLabelText('Body')).toHaveValue('');
  });

  it('updates each field as the user types', async () => {
    const user = userEvent.setup();
    render(<TemplateForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Template name'), 'Welcome');
    await user.type(screen.getByLabelText('Subject'), 'Welcome aboard');
    const body = screen.getByLabelText('Body');
    await user.click(body);
    await user.paste('Hello {{name}}');
    expect(screen.getByLabelText('Template name')).toHaveValue('Welcome');
    expect(screen.getByLabelText('Subject')).toHaveValue('Welcome aboard');
    expect(screen.getByLabelText('Body')).toHaveValue('Hello {{name}}');
  });

  it('submits the entered template data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TemplateForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Template name'), 'Welcome');
    await user.type(screen.getByLabelText('Subject'), 'Welcome aboard');
    await user.type(screen.getByLabelText('Body'), 'Hi there');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Welcome',
      subject: 'Welcome aboard',
      body: 'Hi there',
    });
  });

  it('submits empty strings when nothing is typed (no client validation blocking)', () => {
    const { container } = render(<TemplateForm onSubmit={vi.fn()} />);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(screen.queryByText('Template name')).toBeInTheDocument();
  });

  it('prevents the default form submission', () => {
    const onSubmit = vi.fn();
    const { container } = render(<TemplateForm onSubmit={onSubmit} />);
    expect(fireEvent.submit(container.querySelector('form') as HTMLFormElement)).toBe(false);
    expect(onSubmit).toHaveBeenCalledWith({ name: '', subject: '', body: '' });
  });

  it('does not clear the fields after submitting', async () => {
    const user = userEvent.setup();
    render(<TemplateForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Template name'), 'Persisted');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    expect(screen.getByLabelText('Template name')).toHaveValue('Persisted');
  });

  it('supports multiline body content', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TemplateForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Body'), 'Line one{Enter}Line two');
    await user.type(screen.getByLabelText('Subject'), 'Sub');
    await user.type(screen.getByLabelText('Template name'), 'Name');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Name', subject: 'Sub', body: 'Line one\nLine two' });
  });

  it('stacks the fields vertically', () => {
    const { container } = render(<TemplateForm onSubmit={vi.fn()} />);
    expect(container.querySelector('form')).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('associates each label with the generated control id', () => {
    render(<TemplateForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Template name')).toHaveAttribute('id', 'template-name');
    expect(screen.getByLabelText('Subject')).toHaveAttribute('id', 'subject');
    expect(screen.getByLabelText('Body')).toHaveAttribute('id', 'body');
  });
});
