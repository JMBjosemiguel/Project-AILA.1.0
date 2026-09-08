import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = { data: null, loading: false, error: null };
vi.mock('../../../../hooks/useAnalyticsData', () => ({
  useAnalyticsData: () => state,
}));

import AnalyticsPage from '../index.jsx';

beforeEach(() => {
  state.data = null; state.loading = false; state.error = null;
});

describe('AnalyticsPage — error vs empty', () => {
  it('shows the "no analytics yet" empty state when the API succeeds with no data', () => {
    state.data = { kpis: [] };
    render(<AnalyticsPage />);
    expect(screen.getByText(/No analytics yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('shows an error with Retry when the API fails — not the empty state', () => {
    state.error = new Error('Unable to reach the server.');
    render(<AnalyticsPage />);
    expect(screen.getByText(/Couldn.t load your analytics/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/No analytics yet/i)).not.toBeInTheDocument();
  });

  it('renders KPIs when the API returns them', () => {
    state.data = { kpis: [{ label: 'Avg Score', value: '82%' }] };
    render(<AnalyticsPage />);
    expect(screen.getByText('Avg Score')).toBeInTheDocument();
  });
});
