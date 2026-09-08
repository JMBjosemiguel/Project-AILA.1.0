import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import WelcomeHeader from '../WelcomeHeader.jsx';

describe('WelcomeHeader XP progress', () => {
  it('shows progress INTO the current level, not xp % 500', () => {
    // Level 3 (250 XP) -> 50 XP into the level, bar at 50%.
    render(<WelcomeHeader profile={{ first_name: 'Jo', xp_points: 250, level: 3 }} onAskAI={vi.fn()} />);
    expect(screen.getByText('Lvl 3 · 50/100 XP')).toBeInTheDocument();
    const bar = document.querySelector('[style*="width: 50%"]');
    expect(bar).toBeTruthy();
  });

  it('renders a full-but-not-over bar just before a level up', () => {
    render(<WelcomeHeader profile={{ first_name: 'Jo', xp_points: 99, level: 1 }} onAskAI={vi.fn()} />);
    expect(screen.getByText('Lvl 1 · 99/100 XP')).toBeInTheDocument();
    expect(document.querySelector('[style*="width: 99%"]')).toBeTruthy();
  });

  it('derives the level from XP when the profile omits it', () => {
    render(<WelcomeHeader profile={{ first_name: 'Jo', xp_points: 340 }} onAskAI={vi.fn()} />);
    expect(screen.getByText('Lvl 4 · 40/100 XP')).toBeInTheDocument();
  });

  it('handles a missing / zero profile without crashing', () => {
    render(<WelcomeHeader profile={null} onAskAI={vi.fn()} />);
    expect(screen.getByText('Lvl 1 · 0/100 XP')).toBeInTheDocument();
  });
});
