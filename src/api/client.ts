import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  normalizeBackendAuthSession,
  notifyAuthSessionCleared,
  saveAuthSession,
} from '../auth/authSession';
import type { ApiErrorResponse, BackendAuthResponse } from '../types/api.types';

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, '');

export const apiClient: AxiosInstance = axios.create({
  baseURL: normalizedBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

/**
 * Prevents double `/api/api/...` prefixes when backend responses return
 * paths like `/api/projects/:id/bcf/images/:fileId`.
 */
export function normalizeApiPath(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  if (
    normalizedBaseUrl.endsWith('/api') &&
    (withLeadingSlash === '/api' || withLeadingSlash.startsWith('/api/'))
  ) {
    return withLeadingSlash.slice(4) || '/';
  }
  return withLeadingSlash;
}

const PUBLIC_AUTH_PATHS = new Set([
  '/auth/refresh',
  '/auth/google/url',
  '/auth/google/callback',
  '/auth/google/exchange',
]);

function isPublicAuthRequest(url?: string): boolean {
  if (!url) return false;
  const cleanPath = normalizeApiPath(url).split('?')[0];
  return PUBLIC_AUTH_PATHS.has(cleanPath);
}

let inFlightRefreshPromise: Promise<string | null> | null = null;

/**
 * Refreshes the backend session token using a single shared in-flight request
 * so concurrent 401 responses do not trigger duplicate refresh calls.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  inFlightRefreshPromise = (async () => {
    try {
      const { data } = await axios.post<BackendAuthResponse>(
        `${normalizedBaseUrl}/auth/refresh`,
        { refreshToken },
        { timeout: 15000 },
      );
      const nextSession = normalizeBackendAuthSession(data, refreshToken);
      saveAuthSession(nextSession);
      return nextSession.accessToken;
    } catch {
      return null;
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return inFlightRefreshPromise;
}

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (typeof config.url === 'string') {
      config.url = normalizeApiPath(config.url);
    }

    // Let browser attach the proper multipart boundary for FormData uploads
    if (config.data instanceof FormData && config.headers) {
      if (typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type');
      } else {
        delete (config.headers as Record<string, unknown>)['Content-Type'];
      }
    }

    if (!isPublicAuthRequest(config.url)) {
      const token = getAccessToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isPublicAuthRequest(originalRequest.url)
    ) {
      originalRequest._retry = true;
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${refreshedToken}`;
        }
        return apiClient(originalRequest);
      }

      if (getAccessToken() || getRefreshToken()) {
        clearAuthSession();
        notifyAuthSessionCleared();
      }
    }

    return Promise.reject(error);
  },
);

function extractMessageFromData(data: unknown): string | null {
  if (!data) return null;

  if (data instanceof ArrayBuffer) {
    try {
      const text = new TextDecoder('utf-8').decode(data);
      const parsed = JSON.parse(text) as ApiErrorResponse;
      return extractMessageFromData(parsed);
    } catch {
      return null;
    }
  }

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as ApiErrorResponse;
      return extractMessageFromData(parsed);
    } catch {
      return data || null;
    }
  }

  if (typeof data === 'object') {
    const errObj = data as Partial<ApiErrorResponse>;
    if (errObj.message) {
      return Array.isArray(errObj.message)
        ? errObj.message.join(', ')
        : String(errObj.message);
    }
    if (errObj.error) {
      return String(errObj.error);
    }
  }

  return null;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Error de comunicación con el servidor',
): string {
  if (axios.isAxiosError<unknown>(error)) {
    const extracted = extractMessageFromData(error.response?.data);
    if (extracted) return extracted;
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export async function fetchAuthenticatedBlob(path: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(normalizeApiPath(path), {
    responseType: 'blob',
    timeout: 120000,
  });
  return response.data;
}

export async function fetchAuthenticatedBlobUrl(path: string): Promise<string> {
  const blob = await fetchAuthenticatedBlob(path);
  return URL.createObjectURL(blob);
}

export default apiClient;
