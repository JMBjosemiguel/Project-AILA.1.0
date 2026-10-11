import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/api/adminService', () => ({
  getAdminTopicGroups: vi.fn(),
  regroupAdminTopicGroups: vi.fn(),
}));

import TopicGroupsSection from '../TopicGroups.jsx';
import { getAdminTopicGroups, regroupAdminTopicGroups } from '../../../services/api/adminService';

function group(overrides) {
  return {
    id: 'g1', name: 'Infant Growth', avgPct: 90, topicCount: 2, studentCount: 3,
    topics: [
      { id: 1, title: 'Infant Growth Milestones', courseName: 'OB Nursing', avgPct: 85, studentCount: 3 },
      { id: 2, title: 'Infant Measurements Guide', courseName: 'OB Nursing', avgPct: 95, studentCount: 2 },
    ],
    ...overrides,
  };
}

const STRONG = group({});
const WEAK = group({ id: 'g2', name: 'Wound Care', avgPct: 40, topicCount: 1, studentCount: 1, topics: [
  { id: 3, title: 'Wound Care Basics', courseName: 'Fundamentals', avgPct: 40, studentCount: 1 },
] });

const BASE_DATA = {
  aiGrouped: true,
  generatedAt: new Date(Date.now() - 5 * 60000).toISOString(),
  groups: [STRONG, WEAK],
  strongestIds: ['g1'],
  weakestIds: ['g2'],
};

beforeEach(() => {
  vi.clearAllMocks();
  getAdminTopicGroups.mockResolvedValue(BASE_DATA);
});

describe('TopicGroupsSection', () => {
  it('renders the strongest and weakest groups once loaded', async () => {
    render(<TopicGroupsSection />);
    expect(await screen.findByText('Infant Growth')).toBeInTheDocument();
    expect(screen.getByText('Wound Care')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('shows the "Grouped by AILA" badge and an "updated X ago" timestamp', async () => {
    render(<TopicGroupsSection />);
    await screen.findByText('Infant Growth');
    expect(screen.getByText('Grouped by AILA')).toBeInTheDocument();
    expect(screen.getByText(/updated 5m ago/)).toBeInTheDocument();
  });

  it('shows a quiet fallback note when aiGrouped is false', async () => {
    getAdminTopicGroups.mockResolvedValue({ ...BASE_DATA, aiGrouped: false });
    render(<TopicGroupsSection />);
    expect(await screen.findByText(/AI grouping unavailable/)).toBeInTheDocument();
  });

  it('clicking a group opens its detail dialog with all its topics', async () => {
    const user = userEvent.setup();
    render(<TopicGroupsSection />);
    await screen.findByText('Infant Growth');
    await user.click(screen.getByText('Infant Growth'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Infant Growth Milestones')).toBeInTheDocument();
    expect(screen.getByText('Infant Measurements Guide')).toBeInTheDocument();
  });

  it('"View all groups" opens the full list, weakest first', async () => {
    const user = userEvent.setup();
    render(<TopicGroupsSection />);
    await screen.findByText('Infant Growth');
    await user.click(screen.getByText('View all groups'));
    const dialog = await screen.findByRole('dialog');
    const names = [...dialog.querySelectorAll('button span.font-medium')].map((el) => el.textContent);
    expect(names).toEqual(['Wound Care', 'Infant Growth']);
  });

  it('clicking a group inside "View all groups" opens that group\'s detail dialog', async () => {
    const user = userEvent.setup();
    render(<TopicGroupsSection />);
    await screen.findByText('Infant Growth');
    await user.click(screen.getByText('View all groups'));
    const listDialog = await screen.findByRole('dialog');
    await user.click(within(listDialog).getByText('Wound Care'));
    expect(await screen.findByText('Wound Care Basics')).toBeInTheDocument();
  });

  it('Regroup calls the regroup endpoint and refreshes the displayed data', async () => {
    const user = userEvent.setup();
    const regrouped = { ...BASE_DATA, groups: [{ ...STRONG, avgPct: 77 }, WEAK], generatedAt: new Date().toISOString() };
    regroupAdminTopicGroups.mockResolvedValue(regrouped);
    render(<TopicGroupsSection />);
    await screen.findByText('Infant Growth');
    await user.click(screen.getByRole('button', { name: /regroup/i }));
    await waitFor(() => expect(regroupAdminTopicGroups).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('77%')).toBeInTheDocument();
  });

  it('shows an empty state in both cards when there is no topic progress at all', async () => {
    getAdminTopicGroups.mockResolvedValue({ aiGrouped: true, generatedAt: new Date().toISOString(), groups: [], strongestIds: [], weakestIds: [] });
    render(<TopicGroupsSection />);
    expect(await screen.findAllByText('No topic progress yet')).toHaveLength(2);
  });

  it('shows an error state with Retry when the fetch fails', async () => {
    getAdminTopicGroups.mockRejectedValue(new Error('network down'));
    render(<TopicGroupsSection />);
    expect(await screen.findByText("Couldn't load topic groups")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
