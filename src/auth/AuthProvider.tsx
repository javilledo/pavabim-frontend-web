import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from '../api/auth.service';
import { refreshAccessToken } from '../api/client';
import {
  clearAuthSession,
  getAccessToken,
  getStoredAuthSession,
  saveAuthSession,
  subscribeAuthSessionCleared,
} from './authSession';
import { useViewerStore } from '../store/useViewerStore';
import type { AuthenticatedUser } from '../types/api.types';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  authError: string | null;
  login: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  clearAuthError: () => void;
}

interface RedirectAuthParams {
  authCode: string | null;
  authError: string | null;
}

function consumeRedirectAuthParams(): RedirectAuthParams {
  if (typeof window === 'undefined') {
    return { authCode: null, authError: null };
  }

  const url = new URL(window.location.href);
  const authCode = url.searchParams.get('authCode');
  const authError = url.searchParams.get('authError');

  if (authCode !== null || authError !== null) {
    url.searchParams.delete('authCode');
    url.searchParams.delete('authError');
    const cleanSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }

  return { authCode, authError };
}

const initialRedirectAuthParams = consumeRedirectAuthParams();

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() =>
    Boolean(
      initialRedirectAuthParams.authCode ||
        (!initialRedirectAuthParams.authError && getStoredAuthSession()),
    ),
  );
  const [authError, setAuthError] = useState<string | null>(
    () => initialRedirectAuthParams.authError,
  );

  const resetClientSessionState = useCallback(() => {
    setUser(null);
    useViewerStore.getState().clearLoadedModels();
    useViewerStore.getState().resetProjectContext();
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    const unsubscribe = subscribeAuthSessionCleared(() => {
      resetClientSessionState();
    });
    return unsubscribe;
  }, [resetClientSessionState]);

  useEffect(() => {
    if (initialRedirectAuthParams.authError) {
      clearAuthSession();
      resetClientSessionState();
      setAuthError(initialRedirectAuthParams.authError);
      setLoading(false);
      return;
    }

    let cancelled = false;

    if (initialRedirectAuthParams.authCode) {
      authService
        .exchangeGoogleCode(initialRedirectAuthParams.authCode)
        .then((session) => {
          saveAuthSession(session);
          initialRedirectAuthParams.authCode = null;
          if (!cancelled) {
            setAuthError(null);
            setUser(session.user);
          }
        })
        .catch((err: unknown) => {
          clearAuthSession();
          initialRedirectAuthParams.authCode = null;
          if (!cancelled) {
            resetClientSessionState();
            setAuthError(
              err instanceof Error
                ? err.message
                : 'No se pudo completar el inicio de sesión con Google.',
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    const stored = getStoredAuthSession();
    if (!stored) {
      setLoading(false);
      return;
    }

    authService
      .fetchCurrentUser()
      .then((freshUser) => {
        if (cancelled) return;
        const latestSession = getStoredAuthSession() || stored;
        saveAuthSession({ ...latestSession, user: freshUser });
        setUser(freshUser);
      })
      .catch(() => {
        if (cancelled) return;
        clearAuthSession();
        resetClientSessionState();
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resetClientSessionState]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await authService.startGoogleLogin();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar sesión con Google.';
      setAuthError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    await authService.logout();
    clearAuthSession();
    resetClientSessionState();
  }, [resetClientSessionState]);

  const getIdToken = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      return refreshAccessToken();
    }
    return getAccessToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        login: loginWithGoogle,
        loginWithGoogle,
        logout,
        getIdToken,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  }
  return ctx;
};
