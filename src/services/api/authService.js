import { ApiClientError, apiClient, tokenStorage } from './client';
import { API_ENDPOINTS } from './endpoints';

// Render's free tier can take close to a minute to wake a sleeping instance.
// POSTs are never auto-retried by the shared apiClient (see client.js) since
// repeating one that the server actually received could double it — but a
// login that never got a response at all (no error.response, i.e. the
// request never reached/was never answered by the server) is safe to retry:
// nothing server-side could have happened yet. A login the server DID
// answer (wrong password, 429, etc.) must still fail immediately.
const LOGIN_RETRY_BUDGET_MS = 75000;

function gotNoResponse(error) {
  return error instanceof ApiClientError && error.status === null;
}

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function loginWithRetry(attempt, onRetrying) {
  const startedAt = Date.now();
  let retryCount = 0;

  for (;;) {
    try {
      const result = await attempt();
      onRetrying?.(false);
      return result;
    } catch (error) {
      if (!gotNoResponse(error) || Date.now() - startedAt >= LOGIN_RETRY_BUDGET_MS) {
        onRetrying?.(false);
        throw error;
      }
      retryCount += 1;
      onRetrying?.(true);
      await wait(Math.min(1000 * 2 ** retryCount, 8000));
    }
  }
}

function normalizeSession(data) {
  if (!data?.user) return null;

  return {
    token: data.token ?? tokenStorage.get(),
    user: data.user,
  };
}

function buildRegisterPayload(payload) {
  return {
    first_name: payload.first_name,
    last_name: payload.last_name,
    student_number: payload.student_number || null,
    email: payload.email,
    program: payload.program || null,
    year_level: payload.year_level || null,
    password: payload.password,
  };
}

export const authService = {
  async getCurrentUser() {
    const data = await apiClient.get(API_ENDPOINTS.auth.me);
    return data.user;
  },

  async refreshSession() {
    if (!tokenStorage.get()) return null;

    try {
      const user = await this.getCurrentUser();
      return normalizeSession({ user });
    } catch (error) {
      // Only a genuine 401 means the token itself is invalid/expired — clear
      // it. Anything else (429 rate limit, 5xx, a dropped connection) is a
      // transient failure of the SERVER, not proof the credential is bad;
      // wiping the token here would force a full re-login even though the
      // student was never actually signed out.
      if (error.status === 401) {
        tokenStorage.remove();
      }
      return null;
    }
  },

  async login(credentials, { onRetrying } = {}) {
    const data = await loginWithRetry(
      () => apiClient.post(API_ENDPOINTS.auth.login, {
        email: credentials.email,
        password: credentials.password,
      }),
      onRetrying
    );
    const session = normalizeSession(data);

    if (!session?.token || !session?.user) {
      throw new ApiClientError('Login response did not include a valid session.');
    }

    if (session?.token) {
      tokenStorage.set(session.token);
    }

    return session;
  },

  // Backend response (see authController.registerStatusAndMessage): the
  // account is ALWAYS durable once this resolves (a 2xx) — accountCreated is
  // always true. emailSent distinguishes "check your inbox" from "account
  // exists, but we couldn't send the link — use resend" so the caller can
  // show a truthful, recoverable state instead of a generic failure.
  async register(payload) {
    return apiClient.post(API_ENDPOINTS.auth.register, buildRegisterPayload(payload));
  },

  // Backend response: { alreadyVerified: boolean }. Never throws for a
  // recognised invalid/expired/used token — those are normal outcomes the
  // caller inspects via the thrown ApiClientError's `.details.code` instead
  // (TOKEN_INVALID | TOKEN_SUPERSEDED | TOKEN_EXPIRED) so the Verify Email page can
  // show a specific state rather than a generic error.
  async verifyEmail(token) {
    return apiClient.post(API_ENDPOINTS.auth.verifyEmail, { token });
  },

  // Always resolves — the backend intentionally returns the same generic
  // "sent" shape whether or not the email belongs to an account, so this
  // never reveals account existence.
  async resendVerification(email) {
    return apiClient.post(API_ENDPOINTS.auth.resendVerification, { email });
  },

  // Same anti-enumeration shape as resendVerification — always resolves with
  // the same generic message regardless of whether the email has an account.
  async forgotPassword(email) {
    return apiClient.post(API_ENDPOINTS.auth.forgotPassword, { email });
  },

  // Throws an ApiClientError with `.details.code` (TOKEN_INVALID |
  // TOKEN_EXPIRED) for a bad/used/expired link, same pattern as verifyEmail.
  async resetPassword({ token, password }) {
    return apiClient.post(API_ENDPOINTS.auth.resetPassword, { token, password });
  },

  async logout() {
    try {
      if (tokenStorage.get()) {
        await apiClient.post(API_ENDPOINTS.auth.logout);
      }
    } finally {
      tokenStorage.remove();
    }
  },
};
