import axios from 'axios';

const TOKEN_KEY = 'aila.jwt';
const API_URL = import.meta.env.VITE_API_URL;

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

apiClient.interceptors.response.use(
  (response) => response.data?.data ?? response.data,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      const details = data?.details ?? null;
      const detailMessage = Array.isArray(details)
        ? details.map((item) => item.message).filter(Boolean).join(' ')
        : '';
      const message = detailMessage || data?.message || `Request failed with status ${status}.`;

      return Promise.reject(new ApiClientError(message, { status, details }));
    }

    if (error.request) {
      return Promise.reject(new ApiClientError('Unable to reach the server. Please try again.'));
    }

    return Promise.reject(new ApiClientError(error.message || 'Request failed.'));
  }
);
