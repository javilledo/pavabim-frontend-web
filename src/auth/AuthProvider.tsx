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
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() =>
    Boolean(getStoredAuthSession()),
  );
  const [authError, setAuthError] = useState<string | null>(null);

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
    const stored = getStoredAuthSession();
    if (!stored) {
      setLoading(false);
      return;
    }

    let cancelled = false;

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
      const session = await authService.loginWithGooglePopup();
      saveAuthSession(session);
      setUser(session.user);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar sesión con Google.';
      setAuthError(message);
      throw err;
    }
  }, []);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      try {
        const session = await authService.loginWithEmail(email, password);
        saveAuthSession(session);
        setUser(session.user);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Credenciales inválidas o error al iniciar sesión.';
        setAuthError(message);
        throw err;
      }
    },
    [],
  );

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
        loginWithEmail,
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
