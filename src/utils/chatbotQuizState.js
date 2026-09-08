// Session-scoped UI state for INFORMAL chatbot mini-quizzes.
//
// Chatbot mini-quizzes are practice-only and live inside chat message content —
// they are not formal quiz_attempts and earn no XP (that is the "Save as Quiz"
// path). Their answer / submitted-review state only needs to survive the current
// application session, so a module-level Map is the right scope: it persists
// across conversation switches AND across leaving/returning to the AI Assistant
// page, and clears on a full reload.
//
// Keyed by the message's own stable identity — the chat_messages row id once the
// server has one (`m<id>`), or a per-session client id before then (`c<n>`).
// The DB id is globally unique, so a new chat adopting its real conversation id
// does not orphan the state.

const store = new Map();

function keyFor(message) {
  if (!message) return null;
  if (message.id != null) return `m${message.id}`;
  if (message.clientId != null) return `c${message.clientId}`;
  return null;
}

export function readChatbotQuizState(message) {
  const key = keyFor(message);
  return key ? store.get(key) ?? null : null;
}

export function writeChatbotQuizState(message, state) {
  const key = keyFor(message);
  if (key) store.set(key, state);
}

// Exposed for tests / explicit resets.
export function _resetChatbotQuizState() {
  store.clear();
}
