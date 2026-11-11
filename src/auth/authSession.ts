import type { AuthenticatedUser, BackendAuthResponse } from '../types/api.types';

const AUTH_SESSION_STORAGE_KEY = 'pavabim_auth_session';

export interface StoredAuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user: AuthenticatedUser;
}

type SessionClearedListener = () => void;
const sessionClearedListeners = new Set<SessionClearedListener>();

export function normalizeBackendAuthSession(
  payload: BackendAuthResponse,
  fallbackRefreshToken?: string,
): StoredAuthSession {
  const accessToken = payload.accessToken || payload.idToken;
  if (!accessToken) {
    throw new Error('El backend no devolvió un token de acceso válido.');
  }
  if (!payload.user?.uid) {
    throw new Error('El backend no devolvió los datos del usuario autenticado.');
  }

  const rawExpires =
    typeof payload.expiresIn === 'string'
      ? Number.parseInt(payload.expiresIn, 10)
      : payload.expiresIn;
  const expiresAt =
    rawExpires && Number.isFinite(rawExpires)
      ? Date.now() + rawExpires * 1000
      : undefined;

  return {
    accessToken,
    refreshToken: payload.refreshToken || fallbackRefreshToken,
    expiresAt,
    user: payload.user,
  };
}

export function getStoredAuthSession(): StoredAuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuthSession> | null;
    if (!parsed || typeof parsed.accessToken !== 'string' || !parsed.user?.uid) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken:
        typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
      expiresAt:
        typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined,
      user: parsed.user,
    };
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return getStoredAuthSession()?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return getStoredAuthSession()?.refreshToken ?? null;
}

export function saveAuthSession(session: StoredAuthSession): void {
  try {
    window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } catch {
    // Ignore storage quota or sandbox restrictions
  }
}

export function clearAuthSession(): void {
  try {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

export function subscribeAuthSessionCleared(
  listener: SessionClearedListener,
): () => void {
  sessionClearedListeners.add(listener);
  return () => {
    sessionClearedListeners.delete(listener);
  };
}

export function notifyAuthSessionCleared(): void {
  for (const listener of sessionClearedListeners) {
    listener();
  }
}

