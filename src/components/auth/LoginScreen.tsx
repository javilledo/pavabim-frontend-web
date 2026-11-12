import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';

export const LoginScreen: React.FC = () => {
  const { authError, loginWithGoogle, clearAuthError } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    clearAuthError();
    setIsSubmitting(true);
    try {
      await loginWithGoogle();
    } catch {
      setIsSubmitting(false);
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
              Entorno Común de Datos de PAVASAL para trabajar con Modelos BIM
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {authError && (
            <div className="rounded-lg border border-red-700/70 bg-red-950/60 p-3 text-xs text-red-200">
              {authError}
            </div>
          )}

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 rounded-md bg-pavasal-500 px-4 py-2.5 text-xs font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="w-4 h-4 shrink-0"
            >
              <path
                fill="#111114"
                d="M21.8 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.49a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.05-4.4 3.05-7.48z"
              />
              <path
                fill="#111114"
                d="M12 22c2.75 0 5.06-.91 6.75-2.46l-3.3-2.56c-.91.61-2.08.98-3.45.98-2.65 0-4.9-1.79-5.7-4.2H2.89v2.64A9.99 9.99 0 0 0 12 22z"
              />
              <path
                fill="#111114"
                d="M6.3 13.76a5.98 5.98 0 0 1 0-3.52V7.6H2.89a10 10 0 0 0 0 8.8l3.41-2.64z"
              />
              <path
                fill="#111114"
                d="M12 6.04c1.5 0 2.84.52 3.9 1.53l2.92-2.92C17.05 2.99 14.74 2 12 2A9.99 9.99 0 0 0 2.89 7.6L6.3 10.24c.8-2.41 3.05-4.2 5.7-4.2z"
              />
            </svg>
            <span>
              {isSubmitting
                ? 'Redirigiendo a Google...'
                : 'Continuar con cuenta corporativa de Google'}
            </span>
          </button>
        </div>
      </div>

      <p className="relative z-10 mt-4 text-xs text-asphalt-400 text-center">
        Pavasal Empresa Constructora, S.A.U.
      </p>
    </div>
  );
};

export default LoginScreen;
