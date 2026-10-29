import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import WelcomeHeader from '../WelcomeHeader.jsx';

describe('WelcomeHeader', () => {
  it('greets the student and offers Ask AILA', () => {
    render(<WelcomeHeader profile={{ first_name: 'Jo', xp_points: 250, level: 3 }} onAskAI={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /, Jo$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ask AILA/i })).toBeInTheDocument();
  });

  it('no longer shows level or XP (they moved to the compact progress row)', () => {
    render(<WelcomeHeader profile={{ first_name: 'Jo', xp_points: 250, level: 3 }} onAskAI={vi.fn()} />);
    expect(screen.queryByText(/XP/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lvl|Level/)).not.toBeInTheDocument();
  });

  it('handles a missing profile without crashing', () => {
    render(<WelcomeHeader profile={null} onAskAI={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /^Good (morning|afternoon|evening)$/ })).toBeInTheDocument();
  });
});
