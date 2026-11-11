import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';

export const LoginScreen: React.FC = () => {
  const {
    isConfigured,
    authError,
    loginWithGoogle,
    loginWithEmail,
    clearAuthError,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    clearAuthError();
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch {
      // authError state displays feedback
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    clearAuthError();
    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
    } catch {
      // authError state displays feedback
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-asphalt-950 text-asphalt-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-pavasal-500" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-pavasal-500/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-md rounded-xl border border-asphalt-700 border-t-2 border-t-pavasal-500 bg-asphalt-900/95 backdrop-blur shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3.5 border-b border-asphalt-800 px-6 py-5 bg-asphalt-950/60">
          <img
            src="/favicon.png"
            alt="Pavasal"
            className="w-10 h-10 rounded-full bg-white object-cover border border-pavasal-500 shadow-sm shrink-0"
          />
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-white">
              PAVA<span className="text-pavasal-500">BIM</span>
            </h1>
            <p className="text-xs text-asphalt-300 mt-0.5">
              Inicia sesión con tu cuenta corporativa para acceder al visor 3D
              (.frag / .ifc) y proyectos
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {!isConfigured && (
            <div className="rounded-lg border border-pavasal-700/70 bg-pavasal-950/60 p-3.5 text-xs text-pavasal-200 space-y-1">
              <p className="font-semibold text-pavasal-400">
                Firebase Web no configurado
              </p>
              <p className="text-[11px] text-asphalt-200 leading-relaxed">
                Define las variables{' '}
                <code className="text-pavasal-400">VITE_FIREBASE_*</code> en{' '}
                <code className="text-pavasal-400">.env</code> para autenticar tu
                sesión contra <code className="text-pavasal-400">pavabim-backend</code>.
              </p>
            </div>
          )}

          {authError && (
            <div className="rounded-lg border border-red-700/70 bg-red-950/60 p-3 text-xs text-red-200">
              {authError}
            </div>
          )}

          <button
            type="button"
            disabled={submitting || !isConfigured}
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-xs font-bold text-asphalt-950 hover:bg-asphalt-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
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
                onChange={(e) => {
                  clearAuthError();
                  setEmail(e.target.value);
                }}
                placeholder="usuario@pavasal.com"
                disabled={!isConfigured || submitting}
                className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-2 text-xs text-white placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none disabled:opacity-50"
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
                onChange={(e) => {
                  clearAuthError();
                  setPassword(e.target.value);
                }}
                placeholder="••••••••"
                disabled={!isConfigured || submitting}
                className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-2 text-xs text-white placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={!isConfigured || submitting}
              className="w-full rounded-md bg-pavasal-500 px-4 py-2.5 text-xs font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {submitting ? 'Autenticando...' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="pt-2 border-t border-asphalt-800 text-[11px] text-asphalt-400 text-center leading-relaxed">
            Una vez iniciada la sesión podrás abrir proyectos de Google Drive o
            trabajar en modo local con archivos <code className="text-pavasal-400">.frag</code> e{' '}
            <code className="text-pavasal-400">.ifc</code>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;

