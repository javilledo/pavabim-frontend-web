import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    isConfigured,
    authError,
    loginWithGoogle,
    loginWithEmail,
    enterDemoMode,
    clearAuthError,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    try {
      await loginWithGoogle();
      onClose();
    } catch {
      // authError state displays feedback
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
      onClose();
    } catch {
      // authError state displays feedback
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = () => {
    clearAuthError();
    enterDemoMode();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-asphalt-700 border-t-2 border-t-pavasal-500 bg-asphalt-900 text-asphalt-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-asphalt-800 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-white">
              Iniciar sesión en <span className="text-pavasal-500">PAVABIM</span>
            </h2>
            <p className="text-[11px] text-asphalt-400 mt-0.5">
              Acceso corporativo Pavasal para proyectos, Google Drive y BCF 3.0
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-asphalt-400 hover:bg-asphalt-800 hover:text-white"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!isConfigured && (
            <div className="rounded border border-pavasal-700/70 bg-pavasal-950/60 p-3 text-xs text-pavasal-200 space-y-1">
              <p className="font-semibold text-pavasal-400">
                Firebase Web no configurado
              </p>
              <p className="text-[11px] text-asphalt-200 leading-relaxed">
                Define <code className="text-pavasal-400">VITE_FIREBASE_*</code>{' '}
                en <code className="text-pavasal-400">.env</code> para autenticar
                contra <code className="text-pavasal-400">pavabim-backend</code>,
                o usa el modo local para cargar archivos{' '}
                <code className="text-pavasal-400">.frag</code>.
              </p>
            </div>
          )}

          {authError && (
            <div className="rounded border border-red-700/70 bg-red-950/60 p-2.5 text-xs text-red-200">
              {authError}
            </div>
          )}

          <button
            type="button"
            disabled={submitting || !isConfigured}
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-xs font-bold text-asphalt-950 hover:bg-asphalt-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span>Continuar con Google</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-asphalt-800" />
            <span className="mx-3 text-[10px] uppercase tracking-wider text-asphalt-400">
              o correo y contraseña
            </span>
            <div className="flex-grow border-t border-asphalt-800" />
          </div>

          <form onSubmit={handleEmailSignIn} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@pavasal.com"
                disabled={!isConfigured || submitting}
                className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-xs text-white placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={!isConfigured || submitting}
                className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-xs text-white placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={!isConfigured || submitting}
              className="w-full rounded-md bg-pavasal-500 px-4 py-2 text-xs font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Autenticando...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="pt-2 border-t border-asphalt-800">
            <button
              type="button"
              onClick={handleDemo}
              className="w-full rounded border border-asphalt-700 bg-asphalt-800/80 px-3 py-1.5 text-xs text-asphalt-200 hover:border-pavasal-500/50 hover:text-pavasal-400 transition-colors"
            >
              Continuar en modo local (offline .frag)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
