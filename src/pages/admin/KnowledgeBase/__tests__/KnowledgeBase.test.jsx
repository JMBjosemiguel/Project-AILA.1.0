import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmProvider } from '../../../../components/common/ConfirmDialog';

vi.mock('../../../../services/api/adminService', () => ({
  listAdminCourses: vi.fn(),
  deleteAdminCourse: vi.fn(),
  archiveAdminCourse: vi.fn(),
  unarchiveAdminCourse: vi.fn(),
}));
vi.mock('../../../../components/admin/CourseDetailDialog', () => ({ default: () => null }));
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import AdminKnowledgeBasePage from '../index.jsx';
import { listAdminCourses } from '../../../../services/api/adminService';

const course = (overrides) => ({
  first_name: 'Ada', last_name: 'Lovelace', module_count: 1, lesson_count: 3,
  completion_rate: null, avg_quiz_score: null, created_at: '2026-10-01T00:00:00Z', is_ai_generated: 1, is_archived: 0,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  listAdminCourses.mockResolvedValue({
    courses: [
      course({ id: 1, name: 'Drug Classes', curriculum_subject: 'NCM 106' }),
      course({ id: 2, name: 'Free Notes', curriculum_subject: null }),
    ],
    pagination: { page: 1, totalPages: 1, total: 2, pageSize: 10 },
  });
});

describe('AdminKnowledgeBasePage — curriculum subject column', () => {
  it('shows each course\'s subject, and "Others" for a course without one', async () => {
    render(
      <ConfirmProvider>
        <AdminKnowledgeBasePage />
      </ConfirmProvider>
    );

    expect(await screen.findByText('Drug Classes')).toBeInTheDocument();
    expect(screen.getAllByText('Subject').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NCM 106 Pharmacology').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Others').length).toBeGreaterThan(0);
  });
});
