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
