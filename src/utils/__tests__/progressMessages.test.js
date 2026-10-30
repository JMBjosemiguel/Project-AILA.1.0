import { describe, it, expect } from 'vitest';
import {
  achievementEarnedMessage, levelReachedMessage, progressToastMessages, xpEarnedSuffix,
} from '../progressMessages';

describe('progress toast wording', () => {
  it('is calm, not game-like', () => {
    expect(levelReachedMessage(4)).toBe('Progress: Level 4 reached.');
    expect(achievementEarnedMessage('First Lesson', true)).toBe('Achievement earned: First Lesson');
    expect(levelReachedMessage(4)).not.toMatch(/level up|!/i);
    expect(achievementEarnedMessage('x', true)).not.toMatch(/unlocked/i);
  });
});

describe('progress toasts with gamification hidden (the default)', () => {
  const result = {
    leveledUp: true,
    level: 5,
    newAchievements: [
      { name: 'First Steps', category: 'learning' },
      { name: 'Rising Scholar', category: 'level' },
    ],
  };

  it('drops the level toast, the XP text and level achievements; milestones keep a calm toast', () => {
    expect(xpEarnedSuffix(10)).toBe('');
    expect(progressToastMessages(result)).toEqual(['Study milestone reached: First Steps']);
    expect(achievementEarnedMessage('First Steps')).toBe('Study milestone reached: First Steps');
  });

  it('shows everything again when gamification is turned on', () => {
    expect(xpEarnedSuffix(10, true)).toBe(' +10 XP earned.');
    expect(progressToastMessages(result, true)).toEqual([
      'Progress: Level 5 reached.',
      'Achievement earned: First Steps',
      'Achievement earned: Rising Scholar',
    ]);
  });
});
