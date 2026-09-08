import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../services/api/shareService', () => ({
  getShareStatus: vi.fn(),
  createShare: vi.fn(),
  revokeShare: vi.fn(),
  absoluteShareUrl: (path) => `https://aila.test${path}`,
}));
vi.mock('../Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import ShareDialog from '../ShareDialog.jsx';
import { getShareStatus, createShare, revokeShare } from '../../../services/api/shareService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ShareDialog', () => {
  it('starts on the private state and creates an unlisted link', async () => {
    const user = userEvent.setup();
    getShareStatus.mockResolvedValue({ visibility: 'private', shared: false });
    createShare.mockResolvedValue({ token: 'abcd1234efgh5678', sharePath: '/share/abcd1234efgh5678', createdAt: '2026-01-01' });

    render(<ShareDialog materialType="subject" materialId={5} materialName="Data Structures" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/This material is/i)).toBeInTheDocument());
    expect(screen.getByText(/private/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Create share link/i }));

    await waitFor(() => expect(createShare).toHaveBeenCalledWith('subject', 5));
    expect(screen.getByLabelText(/Share link/i)).toHaveValue('https://aila.test/share/abcd1234efgh5678');
    expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revoke link/i })).toBeInTheDocument();
  });

  it('shows an already-shared material with a hint but no full link, and revokes back to private', async () => {
    const user = userEvent.setup();
    getShareStatus.mockResolvedValue({ visibility: 'unlisted', shared: true, createdAt: '2026-01-01', tokenHint: 'abcd1234' });
    revokeShare.mockResolvedValue({ visibility: 'private', shared: false });

    render(<ShareDialog materialType="quiz" materialId={9} materialName="Recursion" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/unlisted link/i)).toBeInTheDocument());
    expect(screen.getByText(/…abcd1234/)).toBeInTheDocument();
    // full link is not shown until a new one is minted
    expect(screen.queryByLabelText(/Share link/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Revoke link/i }));
    await waitFor(() => expect(revokeShare).toHaveBeenCalledWith('quiz', 9));
    await waitFor(() => expect(screen.getByText(/This material is/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Create share link/i })).toBeInTheDocument();
  });
});
