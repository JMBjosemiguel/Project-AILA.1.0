import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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
    expect(screen.getByText('Facebook: fb.com/ada')).toBeInTheDocument();
    expect(screen.getByText('Contact number: 0917 123 4567')).toBeInTheDocument();
  });

  it('shows "Not set" when the student has not added contact info', async () => {
    getAdminUserDetail.mockResolvedValue(detail({ middle_name: null, facebook: null, contact_number: null }));
    render(<UserDetailDialog userId={10} onClose={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByText('Facebook: Not set')).toBeInTheDocument();
    expect(screen.getByText('Contact number: Not set')).toBeInTheDocument();
  });
});
