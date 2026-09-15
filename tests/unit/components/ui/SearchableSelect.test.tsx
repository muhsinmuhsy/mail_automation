import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

function mockTemplatesResponse(templates: { id: string; name: string }[], pagination: { total: number; page: number; pageSize: number; totalPages: number }) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: templates,
      pagination,
    }),
  };
}

const templatesPage1 = Array.from({ length: 10 }, (_, i) => ({ id: `t${i + 1}`, name: `Template ${i + 1}` }));

describe('SearchableSelect', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders label and placeholder', () => {
    render(
      <SearchableSelect
        label="Template"
        fetchUrl="/api/templates"
        placeholder="Select template"
      />
    );
    expect(screen.getByText('Template')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveTextContent('Select template');
  });

  it('opens dropdown on click and shows search input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockTemplatesResponse([], { total: 0, page: 1, pageSize: 10, totalPages: 0 })));
    render(<SearchableSelect label="Template" fetchUrl="/api/templates" placeholder="Select template" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    });
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('fetches first page from API when opened', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockTemplatesResponse(templatesPage1, { total: 15, page: 1, pageSize: 10, totalPages: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<SearchableSelect label="Template" fetchUrl="/api/templates" pageSize={10} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/templates?page=1&limit=10'),
        expect.objectContaining({ credentials: 'include' })
      );
    });
  });

  it('displays fetched options after load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockTemplatesResponse(templatesPage1, { total: 10, page: 1, pageSize: 10, totalPages: 1 })));
    render(<SearchableSelect label="Template" fetchUrl="/api/templates" pageSize={10} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Template 1' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Template 10' })).toBeInTheDocument();
    });
  });

  it('shows loading spinner while fetching', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; })));
    render(<SearchableSelect label="Template" fetchUrl="/api/templates" pageSize={10} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    });
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });
    await act(async () => {
      resolveFetch(mockTemplatesResponse(templatesPage1, { total: 10, page: 1, pageSize: 10, totalPages: 1 }));
    });
  });

  it('shows no results message when API returns empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockTemplatesResponse([], { total: 0, page: 1, pageSize: 10, totalPages: 0 })));
    render(<SearchableSelect label="Template" fetchUrl="/api/templates" pageSize={10} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    });
    await waitFor(() => {
      expect(screen.getByText('No results found.')).toBeInTheDocument();
    });
  });

  it('calls onChange with value and label when an option is selected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockTemplatesResponse(templatesPage1, { total: 10, page: 1, pageSize: 10, totalPages: 1 })));
    const onChange = vi.fn();
    render(<SearchableSelect label="Template" fetchUrl="/api/templates" pageSize={10} onChange={onChange} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Template 3' })).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Template 3' }));
    });
    expect(onChange).toHaveBeenCalledWith({ target: { value: 't3', label: 'Template 3' } });
  });

  it('closes dropdown on Escape key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockTemplatesResponse(templatesPage1, { total: 10, page: 1, pageSize: 10, totalPages: 1 })));
    render(<SearchableSelect label="Template" fetchUrl="/api/templates" pageSize={10} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Template' }), { key: 'Escape' });
    });
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('refetches with search param when user types in search input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockTemplatesResponse(templatesPage1, { total: 10, page: 1, pageSize: 10, totalPages: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SearchableSelect label="Template" fetchUrl="/api/templates" pageSize={10} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Template' }));
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });
    await act(async () => {
      await user.type(screen.getByPlaceholderText('Search...'), 'welcome');
    });
    await waitFor(() => {
      const searchCall = fetchMock.mock.calls.find((call) => {
        const url = call[0] as string;
        return url.includes('search=welcome');
      });
      expect(searchCall).toBeDefined();
    });
  });

  it('displays selectedLabel when value is set but option not in current page', () => {
    render(
      <SearchableSelect
        label="Template"
        fetchUrl="/api/templates"
        value="t999"
        selectedLabel="My Selected Template"
      />
    );
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveTextContent('My Selected Template');
  });

  it('shows required indicator', () => {
    render(<SearchableSelect label="Template" fetchUrl="/api/templates" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<SearchableSelect label="Template" fetchUrl="/api/templates" error="Choose a template." />);
    expect(screen.getByText('Choose a template.')).toBeInTheDocument();
  });
});
