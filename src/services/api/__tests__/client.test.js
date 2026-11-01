import axios from 'axios';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  apiClient, ApiClientError, SESSION_ENDED_MESSAGE, clearSessionEnded, peekSessionEnded, setSessionEndedHandler, tokenStorage,
} from '../client';
import { getConnectivityState, setConnectivityStatus } from '../connectivityStatus';

function networkError(config) {
  const error = new Error('Network Error');
  error.config = config;
  error.request = {};
  return error;
}

function httpError(config, status, data = {}) {
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = { status, data };
  return error;
}

describe('apiClient GET retry + connectivity banner', () => {
  let originalAdapter;

  beforeEach(() => {
    originalAdapter = apiClient.defaults.adapter;
    setConnectivityStatus('online');
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
    vi.useRealTimers();
    setConnectivityStatus('online');
  });

  it('retries a GET on a network error and resolves once a retry succeeds', async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => { throw networkError(config); });
    const requestSpy = vi.spyOn(axios, 'request').mockResolvedValueOnce({ data: { data: { ok: true } } });

    const result = await apiClient.get('/ping');

    expect(result).toEqual({ ok: true });
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(getConnectivityState().status).toBe('online');
  }, 10000);

  it('retries a GET through a 503, then a 502, then succeeds — banner shows "reconnecting" meanwhile', async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => { throw httpError(config, 503); });
    const statuses = [];
    const unsubscribe = (await import('../connectivityStatus')).subscribeConnectivity((s) => statuses.push(s.status));

    const requestSpy = vi.spyOn(axios, 'request')
      .mockImplementationOnce(async (config) => { throw httpError(config, 502); })
      .mockResolvedValueOnce({ data: { ok: true } });

    const result = await apiClient.get('/ping');

    expect(result).toEqual({ ok: true });
    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(statuses).toContain('reconnecting');
    expect(getConnectivityState().status).toBe('online');
    unsubscribe();
  }, 10000);

  it('never retries a POST — a 503 on POST rejects immediately with the normal error message', async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => { throw httpError(config, 503, { message: 'Service unavailable' }); });
    const requestSpy = vi.spyOn(axios, 'request');

    await expect(apiClient.post('/submit', {})).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Service unavailable',
      status: 503,
    });
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('never retries PUT/PATCH/DELETE either', async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => { throw networkError(config); });
    const requestSpy = vi.spyOn(axios, 'request');

    await expect(apiClient.put('/x', {})).rejects.toBeInstanceOf(ApiClientError);
    await expect(apiClient.patch('/x', {})).rejects.toBeInstanceOf(ApiClientError);
    await expect(apiClient.delete('/x')).rejects.toBeInstanceOf(ApiClientError);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('a non-retryable error on a GET (e.g. 404) is never retried and clears the banner', async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => { throw httpError(config, 404, { message: 'Not found' }); });
    const requestSpy = vi.spyOn(axios, 'request');

    await expect(apiClient.get('/missing')).rejects.toMatchObject({ status: 404, message: 'Not found' });
    expect(requestSpy).not.toHaveBeenCalled();
    expect(getConnectivityState().status).toBe('online');
  });

  it('gives up after the ~60s retry budget with the "waking up" message, and marks the banner unavailable', async () => {
    vi.useFakeTimers();
    apiClient.defaults.adapter = vi.fn(async (config) => { throw networkError(config); });
    vi.spyOn(axios, 'request').mockImplementation(async (config) => { throw networkError(config); });

    const pending = apiClient.get('/ping');
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'ApiClientError',
      message: "AILA's server is waking up. Please try again in a moment.",
    });

    // Advance well past the 60s budget in small steps so every queued
    // setTimeout (the backoff waits) actually fires.
    for (let i = 0; i < 70; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await vi.advanceTimersByTimeAsync(1000);
    }

    await assertion;
    expect(getConnectivityState().status).toBe('unavailable');
  }, 15000);
});

describe('apiClient: a 401 on an ordinary request ends the session', () => {
  let originalAdapter;
  const redirect = vi.fn();

  beforeEach(() => {
    originalAdapter = apiClient.defaults.adapter;
    redirect.mockClear();
    setSessionEndedHandler(redirect);
    clearSessionEnded();
    tokenStorage.set('stale-token');
    setConnectivityStatus('online');
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    setSessionEndedHandler(null);
    clearSessionEnded();
    tokenStorage.remove();
  });

  const failWith401 = (message = 'Session is no longer active.') => {
    apiClient.defaults.adapter = vi.fn(async (config) => { throw httpError(config, 401, { message }); });
  };

  it('clears the token, leaves a note for the login page, and sends the student to sign in', async () => {
    failWith401();

    await expect(apiClient.get('/dashboard/summary')).rejects.toMatchObject({ status: 401 });

    expect(tokenStorage.get()).toBeNull();
    expect(peekSessionEnded()).toBe(true);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(SESSION_ENDED_MESSAGE).toBe('Your session ended, please sign in again.');
  });

  it('also applies to writes (POST/PATCH), not just reads', async () => {
    failWith401();
    await expect(apiClient.patch('/users/me/profile', {})).rejects.toMatchObject({ status: 401 });
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(tokenStorage.get()).toBeNull();
  });

  it('does not sign anyone out for a wrong password at login, a bad reset link, or a wrong current password', async () => {
    failWith401('Invalid email or password.');
    for (const call of [
      () => apiClient.post('/auth/login', {}),
      () => apiClient.post('/auth/reset-password', {}),
      () => apiClient.patch('/users/me/password', {}),
      () => apiClient.get('/auth/me'),
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(call()).rejects.toMatchObject({ status: 401 });
    }
    expect(redirect).not.toHaveBeenCalled();
    expect(tokenStorage.get()).toBe('stale-token');
    expect(peekSessionEnded()).toBe(false);
  });

  it('does nothing for a visitor with no session (for example a shared link)', async () => {
    tokenStorage.remove();
    failWith401('Authentication token is required.');
    await expect(apiClient.post('/share/abc/copy')).rejects.toMatchObject({ status: 401 });
    expect(redirect).not.toHaveBeenCalled();
    expect(peekSessionEnded()).toBe(false);
  });

  it('other errors (403, 500) keep the session', async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => { throw httpError(config, 403, { message: 'Nope.' }); });
    await expect(apiClient.get('/admin/users')).rejects.toMatchObject({ status: 403 });
    expect(redirect).not.toHaveBeenCalled();
    expect(tokenStorage.get()).toBe('stale-token');
  });
});
