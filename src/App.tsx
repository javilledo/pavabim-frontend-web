import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './components/auth/LoginScreen';
import { MainLayout } from './components/layout/MainLayout';
import { applyThemeToDocument, useViewerStore } from './store/useViewerStore';
import { EngineProvider } from './viewer/EngineContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const themeMode = useViewerStore((state) => state.themeMode);
  const setThemeMode = useViewerStore((state) => state.setThemeMode);

  useEffect(() => {
    applyThemeToDocument(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    setThemeMode(mediaQuery.matches ? 'light' : 'dark');

    const handleChange = (event: MediaQueryListEvent) => {
      setThemeMode(event.matches ? 'light' : 'dark');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [setThemeMode]);

  if (loading) {
    return (
      <div className="min-h-screen w-screen bg-asphalt-950 text-asphalt-100 flex flex-col items-center justify-center gap-4">
        <img
          src="/favicon.png"
          alt="Pavasal"
          className="w-12 h-12 rounded-full bg-white object-cover border-2 border-pavasal-500 shadow-lg"
        />
        <div className="flex items-center gap-2.5 text-xs text-asphalt-300">
          <div className="w-4 h-4 border-2 border-pavasal-500 border-t-transparent rounded-full animate-spin" />
          <span>Verificando sesión corporativa...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <EngineProvider>
      <MainLayout />
    </EngineProvider>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
