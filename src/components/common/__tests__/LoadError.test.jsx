import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoadError from '../LoadError.jsx';

describe('LoadError', () => {
  it('shows a failure message — never a "nothing here yet" empty state', () => {
    render(<LoadError message="Unable to reach the server." />);
    expect(screen.getByText("Couldn't load this")).toBeInTheDocument();
    expect(screen.getByText('Unable to reach the server.')).toBeInTheDocument();
  });

  it('offers a retry button only when onRetry is given, and calls it', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<LoadError />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();

    rerender(<LoadError onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
