import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../services/api/adminService', () => ({
  listAnnouncements: vi.fn(),
  archiveAnnouncement: vi.fn(),
  unarchiveAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  sendAnnouncement: vi.fn(),
  listAdminUsers: vi.fn(),
  listAdminCourses: vi.fn(),
}));
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../../components/admin/AnnouncementEditDialog', () => ({ default: () => null }));

import AdminSettingsPage from '../index.jsx';
import { listAnnouncements, sendAnnouncement, listAdminCourses } from '../../../../services/api/adminService';

const LEGACY_COURSE_ANNOUNCEMENT = {
  id: 1, title: 'Old course blast', body: 'hi', target_type: 'course', target_value: '5',
  recipient_count: 3, read_count: 1, is_archived: 0, created_at: '2026-01-01T00:00:00Z',
};
const LEGACY_YEAR_ANNOUNCEMENT = {
  id: 2, title: 'Old year blast', body: 'hi', target_type: 'year_level', target_value: '2',
  recipient_count: 5, read_count: 2, is_archived: 0, created_at: '2026-01-02T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  listAnnouncements.mockResolvedValue({
    announcements: [LEGACY_COURSE_ANNOUNCEMENT, LEGACY_YEAR_ANNOUNCEMENT],
    pagination: { page: 1, totalPages: 1, total: 2, pageSize: 10 },
  });
});

describe('AdminSettingsPage — announcement targets', () => {
  it('only offers Everyone, Specific student, and Role as targets', async () => {
    render(<AdminSettingsPage />);
    await waitFor(() => expect(screen.getByText('Old course blast')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Everyone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Specific student' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Role' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Specific course' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Year level' })).not.toBeInTheDocument();
    // The now-removed targets never load course options.
    expect(listAdminCourses).not.toHaveBeenCalled();
  });

  it('existing announcements sent to a course or year level still display their target', async () => {
    render(<AdminSettingsPage />);
    await waitFor(() => expect(screen.getByText('Old course blast')).toBeInTheDocument());

    expect(screen.getByText('Specific course')).toBeInTheDocument();
    expect(screen.getByText('Year 2')).toBeInTheDocument();
  });

  it('sending to Everyone still works', async () => {
    const user = userEvent.setup();
    sendAnnouncement.mockResolvedValue({ notified: 10 });
    render(<AdminSettingsPage />);
    await waitFor(() => expect(screen.getByText('Old course blast')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Title'), 'Hello');
    await user.type(screen.getByPlaceholderText('Message'), 'World');
    await user.click(screen.getByRole('button', { name: 'Send announcement' }));

    await waitFor(() => expect(sendAnnouncement).toHaveBeenCalledWith('Hello', 'World', 'all', undefined));
  });
});
