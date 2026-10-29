// Toast wording for XP side effects (level reached, achievement earned). Kept
// calm and study-focused; the XP and achievement features themselves are
// unchanged.
export function levelReachedMessage(level) {
  return `Progress: Level ${level} reached.`;
}

export function achievementEarnedMessage(name) {
  return `Achievement earned: ${name}`;
}
