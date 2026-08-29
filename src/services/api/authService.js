import { ApiClientError, apiClient, tokenStorage } from './client';
import { API_ENDPOINTS } from './endpoints';

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
      tokenStorage.remove();
      return null;
    }
  },

  async login(credentials) {
    const data = await apiClient.post(API_ENDPOINTS.auth.login, {
      email: credentials.email,
      password: credentials.password,
    });
    const session = normalizeSession(data);

    if (!session?.token || !session?.user) {
      throw new ApiClientError('Login response did not include a valid session.');
    }

    if (session?.token) {
      tokenStorage.set(session.token);
    }

    return session;
  },

  async register(payload) {
    const data = await apiClient.post(API_ENDPOINTS.auth.register, buildRegisterPayload(payload));
    return data.user;
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
