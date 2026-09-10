import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const mockEditor = {
  unmount: vi.fn(),
};

const mockInit = vi.fn().mockResolvedValue(mockEditor);

vi.mock('@templatical/editor', () => ({
  init: mockInit,
}));

import { VisualEmailEditor } from '@/components/templates/VisualEmailEditor';
import type { TemplateContent } from '@templatical/types';

beforeEach(() => {
  mockInit.mockClear();
  mockEditor.unmount.mockClear();
  mockInit.mockResolvedValue(mockEditor);
});

describe('VisualEmailEditor', () => {
  it('renders a container div with a defined height', () => {
    const { container } = render(<VisualEmailEditor />);
    const div = container.querySelector('div');
    expect(div).not.toBeNull();
    expect(div?.style.height).toBe('100%');
  });

  it('calls init with the container element on mount', async () => {
    const { container } = render(<VisualEmailEditor />);
    await vi.waitFor(() => expect(mockInit).toHaveBeenCalledTimes(1));

    const config = mockInit.mock.calls[0][0];
    expect(config.container).toBe(container.querySelector('div'));
    expect(config.shadowDom).toBe(true);
  });

  it('passes content to init when provided', async () => {
    const content: TemplateContent = {
      blocks: [],
      settings: {
        width: 600,
        backgroundColor: '#ffffff',
        textColor: '#1a1a1a',
        linkUnderline: true,
        fontFamily: 'Arial',
        locale: 'en',
      },
    };

    render(<VisualEmailEditor content={content} />);
    await vi.waitFor(() => expect(mockInit).toHaveBeenCalledTimes(1));

    const config = mockInit.mock.calls[0][0];
    expect(config.content).toBe(content);
  });

  it('passes onChange callback to init', async () => {
    const onChange = vi.fn();
    render(<VisualEmailEditor onChange={onChange} />);
    await vi.waitFor(() => expect(mockInit).toHaveBeenCalledTimes(1));

    const config = mockInit.mock.calls[0][0];
    expect(config.onChange).toBe(onChange);
  });

  it('calls editor.unmount() on cleanup', async () => {
    const { unmount } = render(<VisualEmailEditor />);
    await vi.waitFor(() => expect(mockInit).toHaveBeenCalledTimes(1));

    unmount();
    expect(mockEditor.unmount).toHaveBeenCalledTimes(1);
  });

  it('passes mergeTags config to init when provided', async () => {
    const mergeTags = {
      tags: [
        { label: 'Name', value: 'name' },
        { label: 'T-shirt Size', value: 't_shirt_size' },
      ],
    };

    render(<VisualEmailEditor mergeTags={mergeTags} />);
    await vi.waitFor(() => expect(mockInit).toHaveBeenCalledTimes(1));

    const config = mockInit.mock.calls[0][0];
    expect(config.mergeTags).toBe(mergeTags);
    expect(config.mergeTags.tags).toHaveLength(2);
  });

  it('omits mergeTags from init config when not provided', async () => {
    render(<VisualEmailEditor />);
    await vi.waitFor(() => expect(mockInit).toHaveBeenCalledTimes(1));

    const config = mockInit.mock.calls[0][0];
    expect(config.mergeTags).toBeUndefined();
  });
});
