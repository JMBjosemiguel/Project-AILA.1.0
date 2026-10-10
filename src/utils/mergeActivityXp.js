// The backend logs an XP award and the completion it rewards as two separate
// dashboard_activity_log rows (see backend/src/utils/gamification.js —
// awardXpOnce logs "+N XP - <reason>" as its own 'xp_earned' row, alongside
// whatever logActivity call records the actual lesson/quiz/task completion).
// There is no structured link between them in the API response, and the rows
// aren't reliably adjacent in the list (the backend orders by `created_at`
// with no secondary tiebreaker, so same-second rows can come back in any
// order) — so this buckets by exact timestamp and confirms same-moment rows
// with same-timestamp first, then a title match. It's purely a display
// transform; it never touches stored data.
const XP_PATTERN = /^\+(\d+)\s*XP\s*-\s*(.*)$/i;

function parseXpDescription(description) {
  const match = XP_PATTERN.exec(description || '');
  if (!match) return null;
  return { amount: Number(match[1]), reason: match[2].trim() };
}

// Pulls the "what this was about" title out of a description so an XP row's
// reason can be compared against a completion row's description — e.g.
// 'Completed planner task "Read SQL reference"' and 'Completed task: Read
// SQL reference' both reduce to "read sql reference".
function extractTitle(description) {
  if (!description) return null;
  const quoted = /"([^"]+)"/.exec(description);
  if (quoted) return quoted[1].trim().toLowerCase();
  const afterColon = /:\s*(.+)$/.exec(description);
  if (afterColon) return afterColon[1].trim().toLowerCase();
  return null;
}

// Groups same-created_at rows into xp_earned vs. everything else, pairs them
// by title match first (reliable when a bucket has several pairs at once),
// then — for whatever's left — pairs by elimination only when the remainder
// is unambiguous (exactly one of each). Returns a Map from activity id to
// its paired activity.
function pairByTimestamp(activities) {
  const buckets = new Map();
  for (const activity of activities) {
    const key = activity.created_at;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(activity);
  }

  const partnerOf = new Map();

  for (const bucket of buckets.values()) {
    const xpRows = bucket.filter((a) => a.activity_type === 'xp_earned');
    const otherRows = bucket.filter((a) => a.activity_type !== 'xp_earned');
    if (!xpRows.length || !otherRows.length) continue;

    const unclaimedOthers = [...otherRows];

    for (const xp of xpRows) {
      const parsed = parseXpDescription(xp.description);
      const xpTitle = parsed ? extractTitle(parsed.reason) : null;
      if (!xpTitle) continue;
      const matchIndex = unclaimedOthers.findIndex((other) => extractTitle(other.description) === xpTitle);
      if (matchIndex === -1) continue;
      const [match] = unclaimedOthers.splice(matchIndex, 1);
      partnerOf.set(xp.id, match);
      partnerOf.set(match.id, xp);
    }

    const unclaimedXp = xpRows.filter((xp) => !partnerOf.has(xp.id));
    if (unclaimedXp.length === 1 && unclaimedOthers.length === 1) {
      partnerOf.set(unclaimedXp[0].id, unclaimedOthers[0]);
      partnerOf.set(unclaimedOthers[0].id, unclaimedXp[0]);
    }
  }

  return partnerOf;
}

// Returns display-ready rows: `{ id, activity_type, description, created_at,
// xpAmount }`. `xpAmount` is the parsed XP number (for a pill) or null.
export function mergeActivityXp(activities) {
  const partnerOf = pairByTimestamp(activities);
  const consumed = new Set();
  const result = [];

  activities.forEach((activity) => {
    if (consumed.has(activity.id)) return;
    consumed.add(activity.id);

    const partner = partnerOf.get(activity.id);
    if (partner) {
      consumed.add(partner.id);
      const xpRow = activity.activity_type === 'xp_earned' ? activity : partner;
      const completionRow = activity.activity_type === 'xp_earned' ? partner : activity;
      const parsed = parseXpDescription(xpRow.description);
      result.push({
        id: completionRow.id,
        activity_type: completionRow.activity_type,
        description: completionRow.description,
        created_at: completionRow.created_at,
        xpAmount: parsed ? parsed.amount : null,
      });
      return;
    }

    if (activity.activity_type === 'xp_earned') {
      const parsed = parseXpDescription(activity.description);
      result.push({
        id: activity.id,
        activity_type: activity.activity_type,
        description: parsed ? parsed.reason : activity.description,
        created_at: activity.created_at,
        xpAmount: parsed ? parsed.amount : null,
      });
      return;
    }

    result.push({ ...activity, xpAmount: null });
  });

  return result;
}
