import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../../../services/api/adminService', () => ({ getAdminUserDetail: vi.fn() }));

import UserDetailDialog from '../UserDetailDialog.jsx';
import { getAdminUserDetail } from '../../../services/api/adminService';

const detail = (overrides) => ({
  id: 10, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', program: 'BSN', year_level: 2,
  created_at: '2026-01-01T00:00:00Z', last_login_at: null, storageBytes: 0,
  coursesGenerated: 0, lessonsCompleted: 0, resourcesUploaded: 0, quizAverage: null,
  streak: { current_streak: 0, longest_streak: 0 }, recentActivity: [], recentConversations: [],
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe('UserDetailDialog — recent quiz attempts', () => {
  it('lists each attempt with its raw score, Grade, tab-switch count, time limit and timed-out mark', async () => {
    getAdminUserDetail.mockResolvedValue(detail({
      recentAttempts: [
        { id: 1, topic: 'Pharmacology checkpoint', status: 'submitted', score: 7, total: 10, completed_at: '2026-10-20T08:00:00Z', time_limit_seconds: 600, tab_switch_count: 3, timed_out: true },
        { id: 2, topic: 'Vital signs', status: 'in_progress', score: 0, total: 5, completed_at: null, time_limit_seconds: null, tab_switch_count: 1, timed_out: false },
      ],
    }));
    render(<UserDetailDialog userId={10} onClose={vi.fn()} />);

    expect(await screen.findByText('Pharmacology checkpoint')).toBeInTheDocument();
    expect(screen.getByText('7/10 · Grade 85%')).toBeInTheDocument();
    expect(screen.getByText('3 tab switches')).toBeInTheDocument();
    expect(screen.getByText(/10-min limit · Timed out/)).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('1 tab switch')).toBeInTheDocument();
  });

  it('shows tab switches as a colored badge with a warning icon: gray at 0, amber for 1-4, red for 5+', async () => {
    getAdminUserDetail.mockResolvedValue(detail({
      recentAttempts: [0, 1, 4, 5, 14].map((tabs, i) => ({
        id: i + 1, topic: `Quiz ${i}`, status: 'submitted', score: 5, total: 10, completed_at: '2026-10-20T08:00:00Z',
        time_limit_seconds: 300, tab_switch_count: tabs, timed_out: false,
      })),
    }));
    const { container } = render(<UserDetailDialog userId={10} onClose={vi.fn()} />);
    await screen.findByText('Quiz 0');

    const none = screen.getByText('No tab switches');
    expect(none.className).toMatch(/text-ink-400/);
    expect(none.querySelector('.lucide-triangle-alert')).toBeNull();
    for (const [text, color] of [['1 tab switch', 'amber'], ['4 tab switches', 'amber'], ['5 tab switches', 'rose'], ['14 tab switches', 'rose']]) {
      const badge = screen.getByText(text);
      expect(badge.className).toContain(`text-${color}-700`);
      expect(badge.querySelector('.lucide-triangle-alert')).not.toBeNull();
    }
    expect(container.ownerDocument.querySelectorAll('[data-level="high"]')).toHaveLength(2);
  });

  it('says so when there are no attempts', async () => {
    getAdminUserDetail.mockResolvedValue(detail({ recentAttempts: [] }));
    render(<UserDetailDialog userId={10} onClose={vi.fn()} />);
    expect(await screen.findByText('No quiz attempts yet.')).toBeInTheDocument();
  });
});

describe('UserDetailDialog — personal and contact info', () => {
  it('shows the middle name in the title and the student\'s Facebook and contact number', async () => {
    getAdminUserDetail.mockResolvedValue(detail({ middle_name: 'Byron', facebook: 'fb.com/ada', contact_number: '0917 123 4567' }));
    render(<UserDetailDialog userId={10} onClose={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Ada Byron Lovelace' })).toBeInTheDocument();
    const contact = screen.getByRole('region', { name: 'Contact information' });
    expect(within(contact).getByRole('link', { name: /fb\.com\/ada/ })).toHaveAttribute('href', 'https://fb.com/ada');
    expect(within(contact).getByText('0917 123 4567')).toBeInTheDocument();
    expect(contact.querySelector('.lucide-facebook')).not.toBeNull();
    expect(contact.querySelector('.lucide-phone')).not.toBeNull();
  });

  it('puts the Contact information section near the top, above the stats and activity', async () => {
    getAdminUserDetail.mockResolvedValue(detail({ facebook: 'Ada Lovelace', contact_number: null }));
    render(<UserDetailDialog userId={10} onClose={vi.fn()} />);

    const contact = await screen.findByRole('region', { name: 'Contact information' });
    const stats = screen.getByText('Courses generated');
    expect(contact.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(contact).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(contact).queryByRole('link')).not.toBeInTheDocument(); // a name, not a URL
  });

  it('shows "Not set" when the student has not added contact info', async () => {
    getAdminUserDetail.mockResolvedValue(detail({ middle_name: null, facebook: null, contact_number: null }));
    render(<UserDetailDialog userId={10} onClose={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    const contact = screen.getByRole('region', { name: 'Contact information' });
    expect(within(contact).getAllByText('Not set')).toHaveLength(2);
  });
});
