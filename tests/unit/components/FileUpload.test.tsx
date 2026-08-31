import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileUpload } from '@/components/ui/FileUpload';

describe('FileUpload', () => {
  it('renders a file input', () => {
    render(<FileUpload onFileChange={vi.fn()} />);
    const input = screen.getByDisplayValue('') as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'file');
  });

  it('accepts .pdf by default', () => {
    render(<FileUpload onFileChange={vi.fn()} />);
    const input = screen.getByDisplayValue('') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.pdf');
  });

  it('accepts a custom accept value', () => {
    render(<FileUpload onFileChange={vi.fn()} accept=".png,.jpg" />);
    const input = screen.getByDisplayValue('') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.png,.jpg');
  });

  it('calls onFileChange with the selected file', () => {
    const onFileChange = vi.fn();
    render(<FileUpload onFileChange={onFileChange} />);
    const input = screen.getByDisplayValue('') as HTMLInputElement;
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileChange).toHaveBeenCalledWith(file);
  });

  it('calls onFileChange with null when no file is selected', () => {
    const onFileChange = vi.fn();
    render(<FileUpload onFileChange={onFileChange} />);
    const input = screen.getByDisplayValue('') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(onFileChange).toHaveBeenCalledWith(null);
  });

  it('does not call onFileChange for files exceeding maxSizeMB', () => {
    const onFileChange = vi.fn();
    render(<FileUpload onFileChange={onFileChange} maxSizeMB={1} />);
    const input = screen.getByDisplayValue('') as HTMLInputElement;
    const big = new File([new ArrayBuffer(2 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [big] } });
    expect(onFileChange).not.toHaveBeenCalled();
  });

  it('shows an error message when provided', () => {
    render(<FileUpload onFileChange={vi.fn()} error="Invalid file" />);
    expect(screen.getByText('Invalid file')).toBeInTheDocument();
  });

  it('does not show an error message when omitted', () => {
    const { container } = render(<FileUpload onFileChange={vi.fn()} />);
    expect(container.querySelector('p.text-error')).not.toBeInTheDocument();
  });
});
