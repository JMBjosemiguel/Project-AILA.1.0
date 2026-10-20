import { describe, it, expect } from 'vitest';
import { isGeneratedIdTitle, displayResourceTitle } from '../resourceTitle';

describe('isGeneratedIdTitle', () => {
  it('detects a UUID with spaces instead of dashes (the reported bug)', () => {
    expect(isGeneratedIdTitle('644fbfd5 3d47 4b02 9dee 180cd51fc20f')).toBe(true);
  });

  it('detects a normal dashed UUID and an underscored one', () => {
    expect(isGeneratedIdTitle('644fbfd5-3d47-4b02-9dee-180cd51fc20f')).toBe(true);
    expect(isGeneratedIdTitle('644fbfd5_3d47_4b02_9dee_180cd51fc20f')).toBe(true);
  });

  it('detects a long hex hash with no separators', () => {
    expect(isGeneratedIdTitle('a3f5c9d2e8b14067f9a0c3d4e5f6a7b8c9d0e1f2')).toBe(true);
  });

  it('does not flag a real, readable title', () => {
    expect(isGeneratedIdTitle('Chapter 3 - Cell Biology Notes.pdf')).toBe(false);
    expect(isGeneratedIdTitle('Introduction to Psychology Syllabus')).toBe(false);
    expect(isGeneratedIdTitle('')).toBe(false);
    expect(isGeneratedIdTitle(null)).toBe(false);
  });

  it('does not flag a short, plausible acronym-like title', () => {
    expect(isGeneratedIdTitle('CS101 notes')).toBe(false);
  });
});

describe('displayResourceTitle', () => {
  it('shows "<Type> · <date>" for a generated-id title', () => {
    const result = displayResourceTitle({
      title: '644fbfd5 3d47 4b02 9dee 180cd51fc20f',
      type: 'image',
      created_at: '2026-10-13T10:00:00Z',
    });
    expect(result).toMatch(/^Image · /);
    expect(result).toMatch(/2026/);
  });

  it('falls back to just the type label when there is no date', () => {
    const result = displayResourceTitle({ title: '644fbfd5-3d47-4b02-9dee-180cd51fc20f', type: 'pdf' });
    expect(result).toBe('PDF');
  });

  it('returns the real title unchanged when it is not a generated id', () => {
    expect(displayResourceTitle({ title: 'My Notes.pdf', type: 'pdf', created_at: '2026-10-13T10:00:00Z' })).toBe('My Notes.pdf');
  });

  it('never modifies the input object (display only)', () => {
    const file = { title: '644fbfd5 3d47 4b02 9dee 180cd51fc20f', type: 'image', created_at: '2026-10-13T10:00:00Z' };
    const frozen = Object.freeze({ ...file });
    expect(() => displayResourceTitle(frozen)).not.toThrow();
    expect(frozen.title).toBe('644fbfd5 3d47 4b02 9dee 180cd51fc20f');
  });
});
