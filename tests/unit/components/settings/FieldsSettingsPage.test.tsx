import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FieldsSettingsPage from '@/app/(dashboard)/settings/fields/page';

function mockFieldsResponse(fields: unknown[] = [], total = 0) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: fields,
      pagination: { total, page: 1, pageSize: 20, totalPages: Math.max(1, Math.ceil(total / 20)) },
    }),
  };
}

describe('FieldsSettingsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFieldsResponse()));
  });

  it('renders the page title and description', async () => {
    render(<FieldsSettingsPage />);
    expect(screen.getByText('Custom Fields')).toBeInTheDocument();
    expect(screen.getByText(/Define custom merge fields/)).toBeInTheDocument();
  });

  it('renders the two built-in locked fields', async () => {
    render(<FieldsSettingsPage />);
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getAllByText('Locked')).toHaveLength(2);
  });

  it('shows empty state when no custom fields exist', async () => {
    render(<FieldsSettingsPage />);
    await waitFor(() => expect(screen.getByText('No custom fields yet')).toBeInTheDocument());
  });

  it('shows Add field button', async () => {
    render(<FieldsSettingsPage />);
    expect(screen.getByText('Add field')).toBeInTheDocument();
  });

  it('toggles the field form when Add field is clicked', async () => {
    const user = userEvent.setup();
    render(<FieldsSettingsPage />);
    await user.click(screen.getByText('Add field'));
    expect(screen.getByLabelText('Field label')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('hides the form when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<FieldsSettingsPage />);
    await user.click(screen.getByText('Add field'));
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Field label')).not.toBeInTheDocument();
  });

  it('displays custom fields after loading', async () => {
    const customFields = [
      { id: 'f1', name: 't_shirt_size', label: 'T-shirt size', field_type: 'text', sort_order: 0, is_required: false, version: 0 },
      { id: 'f2', name: 'score', label: 'Score', field_type: 'number', sort_order: 1, is_required: true, version: 0 },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFieldsResponse(customFields, 2)));

    render(<FieldsSettingsPage />);
    await waitFor(() => expect(screen.getByText('T-shirt size')).toBeInTheDocument());
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText(/\{\{t_shirt_size\}\}/)).toBeInTheDocument();
    expect(screen.getByText(/\{\{score\}\}/)).toBeInTheDocument();
  });

  it('shows required badge on required custom fields', async () => {
    const customFields = [
      { id: 'f1', name: 'score', label: 'Score', field_type: 'number', sort_order: 0, is_required: true, version: 0 },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFieldsResponse(customFields, 1)));

    render(<FieldsSettingsPage />);
    await waitFor(() => expect(screen.getByText('Score')).toBeInTheDocument());
    expect(screen.getByText(/required/)).toBeInTheDocument();
  });

  it('opens delete confirmation dialog with usage info', async () => {
    const customFields = [
      { id: 'f1', name: 't_shirt_size', label: 'T-shirt size', field_type: 'text', sort_order: 0, is_required: false, version: 0 },
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockFieldsResponse(customFields, 1))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            template_usage_count: 2,
            contact_value_count: 5,
            affected_template_names: ['Welcome', 'Follow-up'],
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<FieldsSettingsPage />);
    await waitFor(() => expect(screen.getByText('T-shirt size')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('Delete field')).toBeInTheDocument());
    expect(screen.getByText(/Used by 2 templates/)).toBeInTheDocument();
    expect(screen.getByText(/Values on 5 contacts/)).toBeInTheDocument();
  });
});
