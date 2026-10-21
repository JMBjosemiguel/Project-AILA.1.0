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

describe('authService.login (cold-start retry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenStorage.remove();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a login that never got a response, then succeeds once the server answers', async () => {
    apiClient.post
      .mockRejectedValueOnce(new ApiClientError('Unable to reach the server. Please try again.'))
      .mockResolvedValueOnce({ token: 'tok-123', user: { id: 1, role: 'student' } });
    const onRetrying = vi.fn();

    const session = await authService.login({ email: 'ada@example.com', password: 'secret' }, { onRetrying });

    expect(session.token).toBe('tok-123');
    expect(apiClient.post).toHaveBeenCalledTimes(2);
    expect(onRetrying).toHaveBeenCalledWith(true);
    expect(onRetrying).toHaveBeenLastCalledWith(false);
  });

  it('never retries once the server actually answered (e.g. a wrong password) — fails immediately', async () => {
    apiClient.post.mockRejectedValue(new ApiClientError('Invalid email or password.', { status: 401 }));
    const onRetrying = vi.fn();

    await expect(
      authService.login({ email: 'ada@example.com', password: 'wrong' }, { onRetrying })
    ).rejects.toMatchObject({ status: 401 });

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(onRetrying).not.toHaveBeenCalledWith(true);
  });

  it('gives up after the ~75s retry budget and still rejects with a "no response" error', async () => {
    vi.useFakeTimers();
    apiClient.post.mockRejectedValue(new ApiClientError('Unable to reach the server. Please try again.'));

    const pending = authService.login({ email: 'ada@example.com', password: 'secret' }, { onRetrying: () => {} });
    const assertion = expect(pending).rejects.toMatchObject({ status: null });

    for (let i = 0; i < 90; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await vi.advanceTimersByTimeAsync(1000);
    }

    await assertion;
  }, 15000);

  it('register is never retried on a response-less failure (login-only retry)', async () => {
    apiClient.post.mockRejectedValue(new ApiClientError('Unable to reach the server. Please try again.'));

    await expect(authService.register({ email: 'a@b.com', password: 'secret', first_name: 'A', last_name: 'B' })).rejects.toBeInstanceOf(ApiClientError);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
