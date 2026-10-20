import axios from 'axios';
import { setConnectivityStatus } from './connectivityStatus';

const TOKEN_KEY = 'aila.jwt';
const API_URL = import.meta.env.VITE_API_URL;

// Render's free tier can take close to a minute to wake a sleeping instance,
// and Aiven/network blips cause a handful of seconds of 502/503/504 or
// outright connection failures. Retrying GETs quietly (with backoff, for up
// to this long) means the student just sees a brief delay instead of the
// page looking broken. Never applied to POST/PUT/PATCH/DELETE — those are
// not safe to silently repeat.
const RETRY_BUDGET_MS = 60000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function isRetryableError(error) {
  if (error.response) return RETRYABLE_STATUSES.has(error.response.status);
  // No response at all: a network error, a dropped connection, or a timeout.
  return Boolean(error.request);
}

// Slightly longer than the backend's own Gemini deadline (GEMINI_TIMEOUT_MS,
// 30s by default) so a stuck AI generation request always ends in an error
// here instead of an endless spinner, rather than waiting on axios's default
// of no timeout at all.
export const AI_GENERATION_REQUEST_TIMEOUT_MS = 35000;

// Course roadmap + lesson generation get their own longer backend deadline
// (COURSE_GENERATION_DEADLINE_MS, 60s — see courseGenerationService.js)
// because a full roadmap or a 9-section lesson can legitimately take longer
// to stream than a quiz or chat reply. Slightly above that for the same
// reason as AI_GENERATION_REQUEST_TIMEOUT_MS above.
export const COURSE_GENERATION_REQUEST_TIMEOUT_MS = 65000;

export class ApiClientError extends Error {
  constructor(message, { status = null, details = null } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

export const tokenStorage = {
  get() {
    return window.localStorage.getItem(TOKEN_KEY);
  },
  set(token) {
    window.localStorage.setItem(TOKEN_KEY, token);
    return token;
  },
  remove() {
    window.localStorage.removeItem(TOKEN_KEY);
  },
};

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.get();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

function toApiClientError(error) {
  if (error.response) {
    const { status, data } = error.response;
    const details = data?.details ?? null;
    const detailMessage = Array.isArray(details)
      ? details.map((item) => item.message).filter(Boolean).join(' ')
      : '';
    const message = detailMessage || data?.message || `Request failed with status ${status}.`;

    return new ApiClientError(message, { status, details });
  }

  if (error.request) {
    return new ApiClientError('Unable to reach the server. Please try again.');
  }

  return new ApiClientError(error.message || 'Request failed.');
}

apiClient.interceptors.response.use(
  (response) => {
    setConnectivityStatus('online');
    return response.data?.data ?? response.data;
  },
  async (error) => {
    const config = error.config;
    const method = (config?.method || 'get').toLowerCase();

    if (!config || method !== 'get' || !isRetryableError(error)) {
      // Any response at all — even an error one — proves the server is
      // reachable, so a non-retried failure should still clear the banner.
      if (error.response) setConnectivityStatus('online');
      return Promise.reject(toApiClientError(error));
    }

    const startedAt = Date.now();
    let attempt = 0;
    let lastError = error;
    let gaveUpOnBudget = false;

    // Re-issued via the bare `axios` import (not `apiClient`) so this loop
    // never re-enters these same interceptors — config already carries the
    // resolved baseURL/url/auth header from the original attempt.
    for (;;) {
      if (Date.now() - startedAt >= RETRY_BUDGET_MS) {
        gaveUpOnBudget = true;
        break;
      }
      setConnectivityStatus('reconnecting');
      await wait(Math.min(1000 * 2 ** attempt, 8000));
      attempt += 1;
      try {
        const response = await axios.request({ ...config, timeout: config.timeout || 10000 });
        setConnectivityStatus('online');
        return response.data?.data ?? response.data;
      } catch (retryError) {
        lastError = retryError;
        if (!isRetryableError(retryError)) break;
      }
    }

    setConnectivityStatus('unavailable');
    if (gaveUpOnBudget) {
      return Promise.reject(new ApiClientError("AILA's server is waking up. Please try again in a moment.", {
        status: lastError.response?.status ?? null,
      }));
    }
    return Promise.reject(toApiClientError(lastError));
  }
);
