import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';

const router = { push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import CustomFieldsPage from '@/app/(dashboard)/contacts/fields/page';

interface ContactField {
  id: string;
  name: string;
  label: string;
  field_type: string;
  sort_order: number;
  is_required: boolean;
  version: number;
}

function mockField(id: string, label: string, name?: string): ContactField {
  return { id, name: name ?? id, label, field_type: 'text', sort_order: 0, is_required: false, version: 1 };
}

function mockListResponse(data: ContactField[], total: number) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data,
      pagination: { total, page: 1, pageSize: 20, totalPages: Math.max(1, Math.ceil(total / 20)) },
    }),
  };
}

describe('CustomFieldsPage real-time refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reloads the list immediately after a successful delete', async () => {
    const fetchMock = vi.fn();

    fetchMock.mockResolvedValueOnce(mockListResponse([mockField('f1', 'Company')], 1));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { template_usage_count: 0, contact_value_count: 0, affected_template_names: [] } }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: null }),
    });
    fetchMock.mockResolvedValueOnce(mockListResponse([], 0));

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<CustomFieldsPage />);

    await waitFor(() => expect(screen.getByText('Company')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByText('Delete field').parentElement!;
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('No custom fields yet')).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(c => typeof c[0] === 'string' && c[0].includes('/api/contact-fields/f1') && c[1]?.method === 'DELETE')).toBe(true);
    const reloadCall = fetchMock.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/api/contact-fields?page=1')
    );
    expect(reloadCall).toBeDefined();

    vi.unstubAllGlobals();
  });

  it('reloads the list immediately after creating a new field', async () => {
    const fetchMock = vi.fn();

    fetchMock.mockResolvedValueOnce(mockListResponse([], 0));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockField('f1', 'Company', 'company') }),
    });
    fetchMock.mockResolvedValueOnce(mockListResponse([mockField('f1', 'Company', 'company')], 1));

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<CustomFieldsPage />);

    await waitFor(() => expect(screen.getByText('No custom fields yet')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add field' }));

    await user.type(screen.getByLabelText(/Field label/), 'Company');

    await user.click(screen.getByRole('button', { name: 'Save field' }));

    await waitFor(() => expect(screen.getByText('Company')).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(c => typeof c[0] === 'string' && c[0] === '/api/contact-fields' && c[1]?.method === 'POST')).toBe(true);
    const reloadCall = fetchMock.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/api/contact-fields?page=1')
    );
    expect(reloadCall).toBeDefined();

    vi.unstubAllGlobals();
  });
});
