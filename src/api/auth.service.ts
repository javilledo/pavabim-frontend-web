import axios from 'axios';
import apiClient, { getApiErrorMessage } from './client';
import {
  normalizeBackendAuthSession,
  type StoredAuthSession,
} from '../auth/authSession';
import type {
  AuthGoogleExchangePayload,
  AuthGoogleUrlResponse,
  AuthenticatedUser,
  BackendAuthResponse,
} from '../types/api.types';

const exchangePromiseCache = new Map<string, Promise<StoredAuthSession>>();

function formatBackendAuthError(err: unknown, fallback: string): Error {
  if (axios.isAxiosError(err) && err.response?.status === 404) {
    return new Error(
      'El endpoint de autenticación en pavabim-backend (/api/auth/*) aún no está implementado.',
    );
  }
  return new Error(getApiErrorMessage(err, fallback));
}

export const authService = {
  async getGoogleAuthUrl(): Promise<AuthGoogleUrlResponse> {
    try {
      const { data } = await apiClient.get<AuthGoogleUrlResponse>(
        '/auth/google/url',
      );
      return data;
    } catch (err) {
      throw formatBackendAuthError(
        err,
        'No se pudo obtener la URL de autenticación con Google desde el servidor.',
      );
    }
  },

  async startGoogleLogin(): Promise<void> {
    const { url } = await this.getGoogleAuthUrl();
    window.location.assign(url);
  },

  async exchangeGoogleCode(code: string): Promise<StoredAuthSession> {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      throw new Error('Código de autenticación temporal vacío.');
    }

    // Deduplicate concurrent calls caused by React StrictMode double effects
    // because the backend invalidates each authCode after the first use.
    const existing = exchangePromiseCache.get(normalizedCode);
    if (existing) {
      return existing;
    }

    const payload: AuthGoogleExchangePayload = { code: normalizedCode };
    const requestPromise = apiClient
      .post<BackendAuthResponse>('/auth/google/exchange', payload)
      .then(({ data }) => normalizeBackendAuthSession(data))
      .catch((err) => {
        throw formatBackendAuthError(
          err,
          'No se pudo validar el acceso corporativo con Google.',
        );
      });

    exchangePromiseCache.set(normalizedCode, requestPromise);
    return requestPromise;
  },

  async fetchCurrentUser(): Promise<AuthenticatedUser> {
    const { data } = await apiClient.get<AuthenticatedUser>('/auth/me');
    return data;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', undefined, { timeout: 3000 });
    } catch {
      // Clear local session regardless of backend logout availability
    }
  },
};

export default authService;
