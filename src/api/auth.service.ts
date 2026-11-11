import axios from 'axios';
import apiClient, { getApiErrorMessage } from './client';
import {
  normalizeBackendAuthSession,
  type StoredAuthSession,
} from '../auth/authSession';
import type {
  AuthGoogleUrlResponse,
  AuthLoginPayload,
  AuthPopupMessageEventData,
  AuthenticatedUser,
  BackendAuthResponse,
} from '../types/api.types';

function formatBackendAuthError(err: unknown, fallback: string): Error {
  if (axios.isAxiosError(err) && err.response?.status === 404) {
    return new Error(
      'El endpoint de autenticación en pavabim-backend (/api/auth/*) aún no está implementado.',
    );
  }
  return new Error(getApiErrorMessage(err, fallback));
}

export const authService = {
  async loginWithEmail(
    email: string,
    password: string,
  ): Promise<StoredAuthSession> {
    const payload: AuthLoginPayload = {
      email: email.trim(),
      password,
    };

    try {
      const { data } = await apiClient.post<BackendAuthResponse>(
        '/auth/login',
        payload,
      );
      return normalizeBackendAuthSession(data);
    } catch (err) {
      throw formatBackendAuthError(
        err,
        'Credenciales inválidas o error al autenticar con el servidor.',
      );
    }
  },

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

  async loginWithGooglePopup(): Promise<StoredAuthSession> {
    const { url } = await this.getGoogleAuthUrl();

    const width = 520;
    const height = 660;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

    const popup = window.open(
      url,
      'pavabim-backend-google-auth',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      throw new Error(
        'El navegador bloqueó la ventana emergente de inicio de sesión. Habilita las ventanas emergentes e inténtalo de nuevo.',
      );
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        window.clearInterval(closedCheckTimer);
      };

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== popup) return;
        const payload = event.data as Partial<AuthPopupMessageEventData> | null;
        if (!payload || typeof payload !== 'object') return;

        if (payload.type === 'PAVABIM_AUTH_SUCCESS') {
          settled = true;
          cleanup();
          try {
            if (!payload.user) {
              throw new Error('Respuesta OAuth incompleta del servidor.');
            }
            const session = normalizeBackendAuthSession({
              accessToken: payload.accessToken,
              idToken: payload.idToken,
              refreshToken: payload.refreshToken,
              expiresIn: payload.expiresIn,
              user: payload.user,
            });
            resolve(session);
          } catch (normErr) {
            reject(
              normErr instanceof Error
                ? normErr
                : new Error('No se pudo validar la sesión de Google.'),
            );
          }
        } else if (payload.type === 'PAVABIM_AUTH_ERROR') {
          settled = true;
          cleanup();
          reject(
            new Error(
              payload.error || 'No se pudo completar el inicio de sesión con Google.',
            ),
          );
        }
      };

      window.addEventListener('message', handleMessage);

      const closedCheckTimer = window.setInterval(() => {
        if (popup.closed && !settled) {
          settled = true;
          cleanup();
          reject(new Error('Ventana de inicio de sesión cerrada por el usuario.'));
        }
      }, 500);
    });
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

