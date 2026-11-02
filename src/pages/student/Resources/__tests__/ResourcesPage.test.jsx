import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../../../../hooks/useResourceLibraryData', () => ({
  useResourceLibraryData: () => ({
    data: { resources: [], subjects: [], recentlyOpened: [], popular: [], recommended: [] },
    loading: false,
    error: null,
  }),
}));
vi.mock('../../../../services/api/resourceService', () => ({
  addLinkResource: vi.fn(),
  deleteResource: vi.fn(),
  downloadResource: vi.fn(),
  logResourceView: vi.fn(),
  openResourceFile: vi.fn(),
  uploadResource: vi.fn(),
}));
vi.mock('../../../../components/common/ConfirmDialog', () => ({ useConfirm: () => vi.fn() }));
vi.mock('../../../../components/common/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../../components/student/quiz/QuizRunner', () => ({ default: () => null }));

import ResourcesPage from '../index.jsx';
import { uploadResource } from '../../../../services/api/resourceService';

const MB = 1024 * 1024;

function pdfOfSize(bytes) {
  const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

function chooseFile(container, file) {
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResourcesPage — upload size limit', () => {
  it('rejects a file over 25 MB in the browser, without uploading it', () => {
    const { container } = render(<ResourcesPage onNavigate={vi.fn()} />);
    chooseFile(container, pdfOfSize(30 * MB));

    expect(screen.getByText('That file is too large. The maximum size is 25 MB.')).toBeInTheDocument();
    expect(uploadResource).not.toHaveBeenCalled();
  });

  it('uploads a file at the limit', async () => {
    uploadResource.mockResolvedValue({});
    const { container } = render(<ResourcesPage onNavigate={vi.fn()} />);
    chooseFile(container, pdfOfSize(25 * MB));

    await waitFor(() => expect(uploadResource).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/That file is too large/)).not.toBeInTheDocument();
  });
});
