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

describe('AnalyticsPage — "Topics to review" empty state', () => {
  it('says "No data yet" when there is no topic progress at all', () => {
    state.data = { kpis: [], strongTopics: [], weakTopics: [] };
    render(<AnalyticsPage />);
    // "No data yet" also appears on the empty "Strong topics" card — assert via its own message instead.
    expect(screen.getByText('Weak topics will surface here once progress is tracked.')).toBeInTheDocument();
  });

  it('says "Nothing to review right now" when strong topics exist but nothing is weak', () => {
    state.data = { kpis: [], strongTopics: [{ topic: 'SELECT Queries', pct: 100 }], weakTopics: [] };
    render(<AnalyticsPage />);
    expect(screen.getByText('Nothing to review right now')).toBeInTheDocument();
    expect(screen.getByText('Nice work — every tracked topic is in good shape.')).toBeInTheDocument();
    expect(screen.queryByText('No data yet')).not.toBeInTheDocument();
  });

  it('lists the weak topics when there are any, regardless of strong topics', () => {
    state.data = {
      kpis: [],
      strongTopics: [{ topic: 'SELECT Queries', pct: 100 }],
      weakTopics: [{ topic: 'Joins', pct: 40 }],
    };
    render(<AnalyticsPage />);
    expect(screen.getByText('Joins')).toBeInTheDocument();
    expect(screen.queryByText('Nothing to review right now')).not.toBeInTheDocument();
  });
});
