import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResourceCard from '../ResourceCard';

const BASE_FILE = {
  id: 1,
  type: 'image',
  category_name: null,
  subjects: [],
  file_path: '/x.png',
};

describe('ResourceCard — friendly title fallback', () => {
  it('shows a friendly "Type · date" title instead of a raw generated id', () => {
    render(
      <ResourceCard
        file={{ ...BASE_FILE, title: '644fbfd5 3d47 4b02 9dee 180cd51fc20f', created_at: '2026-10-13T10:00:00Z' }}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onDownload={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText(/^Image · /)).toBeInTheDocument();
    expect(screen.queryByText('644fbfd5 3d47 4b02 9dee 180cd51fc20f')).not.toBeInTheDocument();
  });

  it('shows the real title unchanged for a normal file name', () => {
    render(
      <ResourceCard
        file={{ ...BASE_FILE, title: 'Chapter 3 Notes.png', created_at: '2026-10-13T10:00:00Z' }}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onDownload={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Chapter 3 Notes.png')).toBeInTheDocument();
  });
});
