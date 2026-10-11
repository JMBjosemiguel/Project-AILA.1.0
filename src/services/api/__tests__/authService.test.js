import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiClientError, tokenStorage } from '../client';

vi.mock('../client', async () => {
  const actual = await vi.importActual('../client');
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn() } };
});

import { apiClient } from '../client';
import { authService } from '../authService';

describe('authService.refreshSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenStorage.set('a-valid-looking-token');
  });

  it('returns null without calling the API when there is no stored token', async () => {
    tokenStorage.remove();
    const session = await authService.refreshSession();
    expect(session).toBeNull();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('a genuine 401 (invalid/expired token) clears the stored token', async () => {
    apiClient.get.mockRejectedValue(new ApiClientError('Unauthorized', { status: 401 }));
    const session = await authService.refreshSession();
    expect(session).toBeNull();
    expect(tokenStorage.get()).toBeNull();
  });

  // A transient server failure (rate limit, 5xx, a dropped connection) is not
  // proof the token is bad — destroying it here would force a full
  // re-login even though the student was never actually signed out.
  it('a 429 (rate limited) does NOT clear the stored token', async () => {
    apiClient.get.mockRejectedValue(new ApiClientError('Too many requests', { status: 429 }));
    const session = await authService.refreshSession();
    expect(session).toBeNull();
    expect(tokenStorage.get()).toBe('a-valid-looking-token');
  });

  it('a 5xx server error does NOT clear the stored token', async () => {
    apiClient.get.mockRejectedValue(new ApiClientError('Server error', { status: 500 }));
    await authService.refreshSession();
    expect(tokenStorage.get()).toBe('a-valid-looking-token');
  });

  it('a network failure (no status) does NOT clear the stored token', async () => {
    apiClient.get.mockRejectedValue(new ApiClientError('Unable to reach the server. Please try again.'));
    await authService.refreshSession();
    expect(tokenStorage.get()).toBe('a-valid-looking-token');
  });

  it('a successful response returns the session and keeps the token', async () => {
    apiClient.get.mockResolvedValue({ user: { id: 1, first_name: 'Ada' } });
    const session = await authService.refreshSession();
    expect(session).toEqual({ token: 'a-valid-looking-token', user: { id: 1, first_name: 'Ada' } });
    expect(tokenStorage.get()).toBe('a-valid-looking-token');
  });
});
