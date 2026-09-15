import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimezoneSelect } from '@/components/ui/TimezoneSelect';

describe('TimezoneSelect', () => {
  it('renders label and required indicator', () => {
    render(<TimezoneSelect label="Timezone" required />);
    expect(screen.getByText('Timezone')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('shows display label for the selected timezone', () => {
    render(<TimezoneSelect label="Timezone" value="Asia/Calcutta" />);
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent(/Asia\/Calcutta/);
  });

  it('shows UTC label for UTC value', () => {
    render(<TimezoneSelect label="Timezone" value="UTC" />);
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent(/UTC/);
  });

  it('opens dropdown on click with search input', async () => {
    render(<TimezoneSelect label="Timezone" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Timezone' }));
    });
    expect(screen.getByPlaceholderText(/Search timezone/)).toBeInTheDocument();
  });

  it('shows timezone options when opened', async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect label="Timezone" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Timezone' }));
    });
    await act(async () => {
      await user.type(screen.getByPlaceholderText(/Search timezone/), 'Asia/Calcutta');
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Asia\/Calcutta/ })).toBeInTheDocument();
    });
  });

  it('filters timezones by search input', async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect label="Timezone" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Timezone' }));
    });
    await act(async () => {
      await user.type(screen.getByPlaceholderText(/Search timezone/), 'Asia/Calc');
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Asia\/Calcutta/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: /America\/New_York/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Europe\/London/ })).not.toBeInTheDocument();
  });

  it('calls onChange when a timezone is selected', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimezoneSelect label="Timezone" onChange={onChange} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Timezone' }));
    });
    await act(async () => {
      await user.type(screen.getByPlaceholderText(/Search timezone/), 'Asia/Calcutta');
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Asia\/Calcutta/ })).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /Asia\/Calcutta/ }));
    });
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'Asia/Calcutta' } });
  });

  it('closes dropdown on Escape', async () => {
    render(<TimezoneSelect label="Timezone" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Timezone' }));
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search timezone/)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Timezone' }), { key: 'Escape' });
    });
    expect(screen.queryByPlaceholderText(/Search timezone/)).not.toBeInTheDocument();
  });

  it('shows no results message for invalid search', async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect label="Timezone" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Timezone' }));
    });
    await act(async () => {
      await user.type(screen.getByPlaceholderText(/Search timezone/), 'Mars/Olympus');
    });
    await waitFor(() => {
      expect(screen.getByText('No timezones found.')).toBeInTheDocument();
    });
  });

  it('shows error message', () => {
    render(<TimezoneSelect label="Timezone" error="Timezone is required." />);
    expect(screen.getByText('Timezone is required.')).toBeInTheDocument();
  });

  it('displays offset in timezone label', () => {
    render(<TimezoneSelect label="Timezone" value="Asia/Calcutta" />);
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent(/UTC\+5:30/);
  });

  it('marks selected timezone with aria-selected', async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect label="Timezone" value="Asia/Calcutta" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Timezone' }));
    });
    await act(async () => {
      await user.type(screen.getByPlaceholderText(/Search timezone/), 'Asia/Calcutta');
    });
    await waitFor(() => {
      const option = screen.getByRole('option', { name: /Asia\/Calcutta/ });
      expect(option).toHaveAttribute('aria-selected', 'true');
    });
  });
});
