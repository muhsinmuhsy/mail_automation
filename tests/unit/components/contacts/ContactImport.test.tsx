import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactImport } from '@/components/contacts/ContactImport';

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

const csv = () => new File(['name,email\nA,a@example.com\n'], 'contacts.csv', { type: 'text/csv' });

describe('ContactImport', () => {
  it('renders the explanatory copy', () => {
    render(<ContactImport onImport={vi.fn()} />);
    expect(
      screen.getByText(
        'Import contacts from a CSV file. The file should contain name, email, and company columns.'
      )
    ).toBeInTheDocument();
  });

  it('renders a file input restricted to CSV files', () => {
    const { container } = render(<ContactImport onImport={vi.fn()} />);
    const input = fileInput(container);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('accept', '.csv');
    expect(input).toHaveClass('sr-only');
  });

  it('renders the choose-file button', () => {
    render(<ContactImport onImport={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Choose CSV file' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('calls onImport with the selected file', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const { container } = render(<ContactImport onImport={onImport} />);
    const file = csv();
    await user.upload(fileInput(container), file);
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0]).toBe(file);
    expect(onImport.mock.calls[0][0].name).toBe('contacts.csv');
    expect(screen.getByRole('status')).toHaveTextContent('Selected file: contacts.csv');
  });

  it('only reports the first file when several are selected', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const { container } = render(<ContactImport onImport={onImport} />);
    const first = new File(['a'], 'first.csv', { type: 'text/csv' });
    const second = new File(['b'], 'second.csv', { type: 'text/csv' });
    await user.upload(fileInput(container), [first, second]);
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0].name).toBe('first.csv');
  });

  it('does not call onImport when the selection is cleared', () => {
    const onImport = vi.fn();
    const { container } = render(<ContactImport onImport={onImport} />);
    fireEvent.change(fileInput(container), { target: { files: [] } });
    expect(onImport).not.toHaveBeenCalled();
  });

  it('does not call onImport when files is null', () => {
    const onImport = vi.fn();
    const { container } = render(<ContactImport onImport={onImport} />);
    fireEvent.change(fileInput(container), { target: { files: null } });
    expect(onImport).not.toHaveBeenCalled();
  });

  it('forwards the click from the button to the hidden-ish file input', async () => {
    const user = userEvent.setup();
    const { container } = render(<ContactImport onImport={vi.fn()} />);
    const clickSpy = vi.spyOn(fileInput(container), 'click').mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: 'Choose CSV file' }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the file input that belongs to the clicked import widget', async () => {
    const user = userEvent.setup();
    const first = render(<ContactImport onImport={vi.fn()} />);
    const second = render(<ContactImport onImport={vi.fn()} />);
    const firstSpy = vi.spyOn(fileInput(first.container), 'click').mockImplementation(() => {});
    const secondSpy = vi.spyOn(fileInput(second.container), 'click').mockImplementation(() => {});
    await user.click(screen.getAllByRole('button', { name: 'Choose CSV file' })[1]);
    expect(firstSpy).not.toHaveBeenCalled();
    expect(secondSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts a second import after the first', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const { container } = render(<ContactImport onImport={onImport} />);
    await user.upload(fileInput(container), new File(['1'], 'one.csv', { type: 'text/csv' }));
    await user.upload(fileInput(container), new File(['2'], 'two.csv', { type: 'text/csv' }));
    expect(onImport).toHaveBeenCalledTimes(2);
    expect(onImport.mock.calls[1][0].name).toBe('two.csv');
  });

  it('stacks its content vertically', () => {
    const { container } = render(<ContactImport onImport={vi.fn()} />);
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'gap-4');
  });
});
