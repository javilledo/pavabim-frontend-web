import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import { auth, googleProvider, isFirebaseConfigured } from './firebase.config';
import type { AuthenticatedUser } from '../types/api.types';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  isConfigured: boolean;
  isDemoMode: boolean;
  authError: string | null;
  login: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  enterDemoMode: () => void;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function mapFirebaseUser(
  fbUser: FirebaseUser,
): Promise<AuthenticatedUser> {
  let isSuperAdmin = false;
  try {
    const tokenResult = await fbUser.getIdTokenResult();
    isSuperAdmin = Boolean(tokenResult.claims?.superadmin);
  } catch {
    isSuperAdmin = false;
  }

  return {
    uid: fbUser.uid,
    email: fbUser.email || '',
    displayName: fbUser.displayName || fbUser.email || 'Usuario BIM',
    photoURL: fbUser.photoURL || undefined,
    isSuperAdmin,
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState<boolean>(isFirebaseConfigured);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const mapped = await mapFirebaseUser(fbUser);
        setUser(mapped);
        setIsDemoMode(false);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const enterDemoMode = useCallback(() => {
    setAuthError(null);
    setIsDemoMode(true);
    setUser({
      uid: 'offline-demo-user',
      email: 'offline@pavabim.local',
      displayName: 'Modo Local Offline',
      role: 'viewer',
    });
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    if (!isFirebaseConfigured) {
      enterDemoMode();
      return;
    }

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/popup-closed-by-user') {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar sesión con Google.';
      setAuthError(message);
      throw err;
    }
  }, [enterDemoMode]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      if (!isFirebaseConfigured) {
        setAuthError(
          'Firebase no está configurado en .env. Usa el modo offline o configura las variables VITE_FIREBASE_*.',
        );
        return;
      }

      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
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
    setIsDemoMode(false);
    if (isFirebaseConfigured && auth.currentUser) {
      await signOut(auth);
    }
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const getIdToken = useCallback(async (forceRefresh = false) => {
    if (!isFirebaseConfigured || !auth.currentUser) return null;
    return auth.currentUser.getIdToken(forceRefresh);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isConfigured: isFirebaseConfigured,
        isDemoMode,
        authError,
        login: loginWithGoogle,
        loginWithGoogle,
        loginWithEmail,
        logout,
        enterDemoMode,
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
