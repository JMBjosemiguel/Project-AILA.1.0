import { describe, it, expect } from 'vitest';
import { mergeActivityXp } from '../mergeActivityXp';

function row(id, activity_type, description, created_at = '2026-10-09T02:39:00.000Z') {
  return { id, activity_type, description, created_at };
}

describe('mergeActivityXp', () => {
  it('merges an adjacent xp_earned row into the completion row it rewards, completion row first', () => {
    const activities = [
      row(2, 'task_completed', 'Completed task: Study for Psych midterm'),
      row(1, 'xp_earned', '+5 XP - Completed planner task "Study for Psych midterm"'),
    ];
    const result = mergeActivityXp(activities);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 2,
      activity_type: 'task_completed',
      description: 'Completed task: Study for Psych midterm',
      xpAmount: 5,
    });
  });

  it('merges when the xp_earned row comes first (backend order can go either way)', () => {
    const activities = [
      row(1, 'xp_earned', '+20 XP - Completed the "QA-MANUAL resume demo" quiz'),
      row(2, 'quiz_completed', 'Scored 3/3 on "QA-MANUAL resume demo" quiz'),
    ];
    const result = mergeActivityXp(activities);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 2, activity_type: 'quiz_completed', xpAmount: 20 });
  });

  it('never merges two rows with different timestamps', () => {
    const activities = [
      row(1, 'task_completed', 'Completed task: A', '2026-10-09T02:39:00.000Z'),
      row(2, 'xp_earned', '+5 XP - Completed planner task "A"', '2026-10-09T02:40:00.000Z'),
    ];
    const result = mergeActivityXp(activities);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === 1).xpAmount).toBeNull();
    expect(result.find((r) => r.id === 2).xpAmount).toBe(5);
  });

  it('shows an unpaired xp_earned row on its own, with the reason parsed out for the pill', () => {
    const activities = [row(1, 'xp_earned', '+7 XP - debug')];
    const result = mergeActivityXp(activities);
    expect(result).toEqual([
      { id: 1, activity_type: 'xp_earned', description: 'debug', created_at: activities[0].created_at, xpAmount: 7 },
    ]);
  });

  it('leaves non-xp rows with no partner untouched, with a null xpAmount', () => {
    const activities = [row(1, 'resource_viewed', 'Viewed resource: Notes.pdf')];
    const result = mergeActivityXp(activities);
    expect(result).toEqual([{ ...activities[0], xpAmount: null }]);
  });

  it('leaves everything unpaired when a timestamp bucket has 2 xp rows, 1 completion, and no title to disambiguate', () => {
    // Ambiguous: either xp row could "belong" to the one completion row, and
    // neither description carries a title to check against — guessing would
    // risk attaching the wrong XP amount, so nothing merges.
    const ts = '2026-10-09T02:39:00.000Z';
    const activities = [
      row(1, 'xp_earned', '+5 XP - first', ts),
      row(2, 'task_completed', 'Completed task: Only one', ts),
      row(3, 'xp_earned', '+9 XP - second', ts),
    ];
    const result = mergeActivityXp(activities);
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.id !== 2 || r.xpAmount === null)).toBe(true);
  });

  it('pairs multiple same-timestamp rows by title match even when the backend returns them interleaved, not adjacent', () => {
    // Reproduces the real shape seen from the API: the backend orders by
    // created_at with no secondary tiebreaker, so same-second XP/completion
    // pairs can come back scrambled rather than next to each other.
    const ts = '2026-10-09T02:39:00.000Z';
    const activities = [
      row(1, 'task_completed', 'Completed task: Study for Psych midterm', ts),
      row(2, 'xp_earned', '+5 XP - Completed planner task "Read SQL reference"', ts),
      row(3, 'task_completed', 'Completed task: Read SQL reference', ts),
      row(4, 'xp_earned', '+5 XP - Completed planner task "Study for Psych midterm"', ts),
    ];
    const result = mergeActivityXp(activities);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === 1)).toMatchObject({ activity_type: 'task_completed', xpAmount: 5 });
    expect(result.find((r) => r.id === 3)).toMatchObject({ activity_type: 'task_completed', xpAmount: 5 });
  });

  it('handles an empty list', () => {
    expect(mergeActivityXp([])).toEqual([]);
  });

  it('does not crash on a description that does not match the "+N XP - reason" format', () => {
    const activities = [row(1, 'xp_earned', 'something unexpected')];
    const result = mergeActivityXp(activities);
    expect(result).toEqual([{ ...activities[0], xpAmount: null }]);
  });
});
