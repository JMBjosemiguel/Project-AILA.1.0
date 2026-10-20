import axios from 'axios';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, ApiClientError } from '../client';
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
