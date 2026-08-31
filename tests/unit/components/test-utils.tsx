import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * Shared test helpers for the `tests/unit/components` suite.
 * All shared utilities must live in this file (per task rules).
 */

export function renderComponent(ui: ReactElement): RenderResult {
  return render(ui);
}

export { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
export { expect } from 'vitest';
