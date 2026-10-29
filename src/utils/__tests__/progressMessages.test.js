import { describe, it, expect } from 'vitest';
import { achievementEarnedMessage, levelReachedMessage } from '../progressMessages';

describe('progress toast wording', () => {
  it('is calm, not game-like', () => {
    expect(levelReachedMessage(4)).toBe('Progress: Level 4 reached.');
    expect(achievementEarnedMessage('First Lesson')).toBe('Achievement earned: First Lesson');
    expect(levelReachedMessage(4)).not.toMatch(/level up|!/i);
    expect(achievementEarnedMessage('x')).not.toMatch(/unlocked/i);
  });
});
