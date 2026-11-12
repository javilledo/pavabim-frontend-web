import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectsService } from '../../api/projects.service';
import { useAuth } from '../../auth/AuthProvider';
import { useProjectRole } from '../../hooks/useProjectRole';
import { useViewerStore, type MeasureMode } from '../../store/useViewerStore';
import { useEngine } from '../../viewer/EngineContext';
import {
  ProjectManagementModal,
  type ProjectManagementTab,
} from '../projects/ProjectManagementModal';

function getUserInitials(displayName?: string, email?: string): string {
  const source = (displayName || email || '').trim();
  if (!source) return 'U';
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export const RibbonToolbar: React.FC = () => {
  const adminMenuRef = useRef<HTMLDivElement | null>(null);
  const measureBtnRef = useRef<HTMLButtonElement | null>(null);
  const measureMenuRef = useRef<HTMLDivElement | null>(null);
  const measureHoldTimerRef = useRef<number | null>(null);
  const measureHoldTriggeredRef = useRef(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] =
    useState<ProjectManagementTab>('overview');
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isMeasureMenuOpen, setIsMeasureMenuOpen] = useState(false);
  const [measureMenuPos, setMeasureMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const { user, loading: authLoading, logout } = useAuth();
  const {
    role,
    isSuperAdmin,
    isAdmin,
    canCreateProject,
    canManageProject,
    canManageMembers,
  } = useProjectRole();

  const {
    activeTool,
    measureMode,
    cameraProjection,
    isGridVisible,
    isSectionActive,
    loadedModels,
    selectedElementsMap,
    hiddenElementsMap,
    isIsolationActive,
    projects,
    currentProject,
    setActiveTool,
    setMeasureMode,
    setProjects,
    setCurrentProjectById,
    resetProjectContext,
  } = useViewerStore();

  const {
    isEngineReady,
    setPlanView,
    toggleGridVisibility,
    clearSections,
    setCameraProjection,
    hideSelectedElements,
    isolateSelectedElements,
    showAllElements,
  } = useEngine();

  const selectedCount = useMemo(
    () =>
      Object.values(selectedElementsMap).reduce(
        (acc, ids) => acc + ids.length,
        0,
      ),
    [selectedElementsMap],
  );

  const hiddenCount = useMemo(
    () =>
      Object.values(hiddenElementsMap).reduce(
        (acc, ids) => acc + ids.length,
        0,
      ),
    [hiddenElementsMap],
  );

  const projectsQuery = useQuery({
    queryKey: ['projects', user?.uid],
    queryFn: () => projectsService.listProjects(),
    enabled: Boolean(user),
    retry: 1,
  });

  useEffect(() => {
    if (projectsQuery.data) {
      setProjects(projectsQuery.data);
    }
  }, [projectsQuery.data, setProjects]);

  useEffect(() => {
    if (!user) {
      resetProjectContext();
    }
  }, [user, resetProjectContext]);

  const avatarUrl =
    user?.photoURL ||
    (user as ({ picture?: string } | null))?.picture ||
    undefined;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  const canShowAdminGear = Boolean(
    user && (isSuperAdmin || (currentProject && isAdmin)),
  );

  useEffect(() => {
    if (!canShowAdminGear) {
      setIsAdminMenuOpen(false);
      setIsProjectModalOpen(false);
    }
  }, [canShowAdminGear]);

  useEffect(() => {
    if (!isAdminMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        adminMenuRef.current &&
        !adminMenuRef.current.contains(event.target as Node)
      ) {
        setIsAdminMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAdminMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAdminMenuOpen]);

  const openManagementTab = (targetTab: ProjectManagementTab) => {
    setModalInitialTab(targetTab);
    setIsAdminMenuOpen(false);
    setIsProjectModalOpen(true);
  };

  const clearMeasureHoldTimer = () => {
    if (measureHoldTimerRef.current !== null) {
      window.clearTimeout(measureHoldTimerRef.current);
      measureHoldTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (measureHoldTimerRef.current !== null) {
        window.clearTimeout(measureHoldTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMeasureMenuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (
        target instanceof Node &&
        (measureMenuRef.current?.contains(target) ||
          measureBtnRef.current?.contains(target))
      ) {
        return;
      }
      setIsMeasureMenuOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMeasureMenuOpen(false);
      }
    };

    const closeOnResize = () => setIsMeasureMenuOpen(false);

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeOnResize);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [isMeasureMenuOpen]);

  const openMeasureModeMenu = () => {
    const rect = measureBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 232;
    setMeasureMenuPos({
      x: Math.min(rect.left, Math.max(8, window.innerWidth - menuWidth - 8)),
      y: rect.bottom + 6,
    });
    setIsMeasureMenuOpen(true);
  };

  const handleMeasurePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isEngineReady || e.button !== 0) return;
    clearMeasureHoldTimer();
    measureHoldTriggeredRef.current = false;
    measureHoldTimerRef.current = window.setTimeout(() => {
      measureHoldTimerRef.current = null;
      measureHoldTriggeredRef.current = true;
      openMeasureModeMenu();
    }, 380);
  };

  const handleSelectMeasureMode = (mode: MeasureMode) => {
    setMeasureMode(mode);
    setActiveTool('measure');
    setIsMeasureMenuOpen(false);
  };

  const toggleMeasureTool = () => {
    if (measureHoldTriggeredRef.current) {
      measureHoldTriggeredRef.current = false;
      return;
    }
    setIsMeasureMenuOpen(false);
    setActiveTool(activeTool === 'measure' ? 'select' : 'measure');
  };

  const toggleCoordinatesTool = () => {
    setActiveTool(activeTool === 'coordinates' ? 'select' : 'coordinates');
  };

  const toolBtnClass = (isActive: boolean) =>
    `px-2.5 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5 ${
      isActive
        ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
        : 'text-asphalt-200 font-medium hover:bg-asphalt-800 hover:text-white'
    }`;

  return (
    <>
      <header className="h-12 flex-shrink-0 bg-asphalt-950 border-t-2 border-t-pavasal-500 border-b border-b-asphalt-700 px-3 flex items-center justify-between gap-3 select-none">
        {/* Brand + Project Context */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <img
              src="/favicon.png"
              alt="Pavasal"
              className="w-7 h-7 rounded-full bg-white object-cover border border-pavasal-500 shadow-sm"
            />
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-sm font-extrabold tracking-tight text-white">
                PAVA<span className="text-pavasal-500">BIM</span>
              </span>
              <span className="text-[9px] font-semibold tracking-[0.18em] text-asphalt-400 uppercase mt-0.5">
                PAVASAL
              </span>
            </div>
          </div>

          <div className="h-5 w-px bg-asphalt-700 hidden sm:block" />

          {/* Project Selector */}
          {user && (
            <div className="flex items-center gap-1.5 min-w-0">
              <select
                value={currentProject?.id || ''}
                onChange={(e) => setCurrentProjectById(e.target.value || null)}
                disabled={projectsQuery.isLoading}
                className="w-52 sm:w-64 lg:w-72 xl:w-80 truncate rounded border border-asphalt-700 bg-asphalt-900 px-2.5 py-1 text-xs text-asphalt-100 focus:border-pavasal-500 focus:outline-none"
                title="Seleccionar proyecto activo o usar visor local sin proyecto"
              >
                <option value="">Sin proyecto (visor local)</option>
                {projectsQuery.isLoading ? (
                  <option value="" disabled>
                    Cargando proyectos...
                  </option>
                ) : (
                  projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>

        {/* Center 3D Viewer Tools */}
        <div className="flex items-center gap-1 bg-asphalt-900 border border-asphalt-700 rounded-md px-1.5 py-1 min-w-0 overflow-x-auto">
          <button
            ref={measureBtnRef}
            type="button"
            onClick={toggleMeasureTool}
            onPointerDown={handleMeasurePointerDown}
            onPointerUp={clearMeasureHoldTimer}
            onPointerLeave={clearMeasureHoldTimer}
            onPointerCancel={clearMeasureHoldTimer}
            onContextMenu={(e) => {
              if (!isEngineReady) return;
              e.preventDefault();
              openMeasureModeMenu();
            }}
            disabled={!isEngineReady}
            aria-pressed={activeTool === 'measure'}
            aria-haspopup="menu"
            aria-expanded={isMeasureMenuOpen}
            className={`${toolBtnClass(activeTool === 'measure')} whitespace-nowrap shrink-0 disabled:opacity-40`}
            title={
              activeTool === 'measure'
                ? 'Desactivar medición (Esc) · Mantén pulsado para cambiar entre Distancia, Área y Volumen'
                : 'Medir (mantén pulsado para elegir Distancia, Área o Volumen)'
            }
          >
            {measureMode === 'area' ? (
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2.5 3.5h11v9h-11z" />
                <path d="M2.5 8h11M8 3.5v9" opacity="0.55" />
              </svg>
            ) : measureMode === 'volume' ? (
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5L8 1.8Z" />
                <path d="M8 8v6.2M8 8 13.5 5M8 8 2.5 5" />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M11.2 1.8l3 3-9.4 9.4-3-3 9.4-9.4Z" />
                <path d="M8.85 4.15l1.2 1.2M6.5 6.5l1.6 1.6M4.15 8.85l1.2 1.2" />
              </svg>
            )}
            <span>
              {measureMode === 'area'
                ? 'Área'
                : measureMode === 'volume'
                  ? 'Volumen'
                  : 'Medir'}
            </span>
            <svg
              className="w-2.5 h-2.5 shrink-0 opacity-75"
              viewBox="0 0 10 10"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M2.2 3.6 5 6.6l2.8-3H2.2Z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={toggleCoordinatesTool}
            disabled={!isEngineReady}
            aria-pressed={activeTool === 'coordinates'}
            className={`${toolBtnClass(activeTool === 'coordinates')} whitespace-nowrap shrink-0 disabled:opacity-40`}
            title={
              activeTool === 'coordinates'
                ? 'Desactivar consulta de coordenadas (Esc)'
                : 'Consultar coordenadas X, Y, Z de un vértice'
            }
          >
            <svg
              className="w-3.5 h-3.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="4.8" />
              <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
              <path d="M8 1.2v2.3M8 12.5v2.3M1.2 8h2.3M12.5 8h2.3" />
            </svg>
            Coordenadas
          </button>

          <div className="h-4 w-px bg-asphalt-700 mx-1 shrink-0" />

          <button
            type="button"
            onClick={() => void setPlanView()}
            disabled={!isEngineReady}
            className="px-2.5 py-1.5 rounded text-xs font-medium text-asphalt-200 hover:bg-asphalt-800 hover:text-white disabled:opacity-40 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
            title="Vista en planta (desde arriba)"
          >
            <svg
              className="w-3.5 h-3.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 1.8v6.2" />
              <path d="M5.7 5.8L8 8.2l2.3-2.4" />
              <path
                d="M4.3 9.8h9.5l-2.1 3.8H2.2l2.1-3.8Z"
                fill="currentColor"
                fillOpacity="0.16"
              />
            </svg>
            Planta
          </button>
          <button
            type="button"
            onClick={() => toggleGridVisibility()}
            disabled={!isEngineReady}
            aria-label="Grilla"
            aria-pressed={isGridVisible}
            className={`${toolBtnClass(isGridVisible)} px-2 whitespace-nowrap shrink-0 disabled:opacity-40`}
            title={isGridVisible ? 'Ocultar grilla' : 'Mostrar grilla'}
          >
            <svg
              className="w-4 h-4 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="12" height="12" rx="1" />
              <path d="M6 2v12M10 2v12M2 6h12M2 10h12" />
            </svg>
          </button>
          {isSectionActive && (
            <button
              type="button"
              onClick={() => clearSections()}
              disabled={!isEngineReady}
              className="px-2 py-1.5 rounded text-xs font-medium text-pavasal-300 bg-asphalt-800 hover:bg-asphalt-700 hover:text-white disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
              title="Eliminar planos de sección activos"
            >
              Quitar secciones
            </button>
          )}

          <div className="h-4 w-px bg-asphalt-700 mx-1 shrink-0" />

          <button
            type="button"
            onClick={() => void hideSelectedElements()}
            disabled={!isEngineReady || selectedCount === 0}
            className="px-2.5 py-1.5 rounded text-xs font-medium text-asphalt-200 hover:bg-asphalt-800 hover:text-white disabled:opacity-40 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title={
              selectedCount > 0
                ? `Ocultar ${selectedCount} elemento${selectedCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'} (Espacio)`
                : 'Selecciona uno o más elementos (Ctrl+clic o desde el panel Elementos) para ocultarlos (Espacio)'
            }
          >
            <svg
              className="w-3.5 h-3.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path
                d="M2 2l12 12M6.5 6.6a2 2 0 0 0 2.9 2.8M4.3 4.5C2.8 5.4 1.8 6.8 1.5 8c.9 2.7 3.6 4.5 6.5 4.5 1.3 0 2.6-.4 3.7-1M9.2 3.7C11.7 4.2 13.8 5.9 14.5 8c-.4 1.1-1.1 2.1-2 2.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Ocultar seleccionados
          </button>

          <button
            type="button"
            onClick={() => void isolateSelectedElements()}
            disabled={!isEngineReady || selectedCount === 0}
            className="px-2.5 py-1.5 rounded text-xs font-medium text-asphalt-200 hover:bg-asphalt-800 hover:text-white disabled:opacity-40 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title={
              selectedCount > 0
                ? `Aislar ${selectedCount} elemento${selectedCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'} (ocultar el resto)`
                : 'Selecciona uno o más elementos (Ctrl+clic o desde el panel Elementos) para aislarlos'
            }
          >
            <svg
              className="w-3.5 h-3.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2.5 5.5V2.5h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />
              <rect x="6" y="6" width="4" height="4" rx="0.5" />
            </svg>
            Aislar
          </button>

          <button
            type="button"
            onClick={() => void showAllElements()}
            disabled={!isEngineReady || loadedModels.length === 0}
            className={`px-2.5 py-1.5 rounded text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              hiddenCount > 0 ||
              isIsolationActive ||
              loadedModels.some((m) => !m.visible)
                ? 'bg-pavasal-500/15 border border-pavasal-500/50 text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950'
                : 'text-asphalt-200 hover:bg-asphalt-800 hover:text-white'
            }`}
            title={
              hiddenCount > 0
                ? `Mostrar todo lo cargado (${hiddenCount} elementos ocultos)`
                : 'Mostrar todos los elementos y modelos cargados'
            }
          >
            <svg
              className="w-3.5 h-3.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path
                d="M1.5 8C2.6 5.3 5.1 3.5 8 3.5S13.4 5.3 14.5 8c-1.1 2.7-3.6 4.5-6.5 4.5S2.6 10.7 1.5 8Z"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="8" r="2" />
            </svg>
            Mostrar todo
          </button>

          <div className="h-4 w-px bg-asphalt-700 mx-1 shrink-0" />

          {/* Camera Projection Switcher: Perspective (Conical) vs Orthographic */}
          <div
            role="group"
            aria-label="Tipo de proyección"
            className="flex items-center gap-0.5 rounded bg-asphalt-950/80 border border-asphalt-700/80 p-0.5 shrink-0"
          >
            <button
              type="button"
              disabled={!isEngineReady}
              aria-pressed={cameraProjection === 'Perspective'}
              onClick={() => void setCameraProjection('Perspective')}
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-40 ${
                cameraProjection === 'Perspective'
                  ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
                  : 'text-asphalt-200 font-medium hover:bg-asphalt-800 hover:text-white'
              }`}
              title="Vista cónica (perspectiva)"
            >
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <path d="M4.5 3.5h7l2.5 9H2l2.5-9Z" strokeLinejoin="round" />
                <path d="M6 6.5h4" strokeLinecap="round" />
              </svg>
              Cónica
            </button>
            <button
              type="button"
              disabled={!isEngineReady}
              aria-pressed={cameraProjection === 'Orthographic'}
              onClick={() => void setCameraProjection('Orthographic')}
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-40 ${
                cameraProjection === 'Orthographic'
                  ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
                  : 'text-asphalt-200 font-medium hover:bg-asphalt-800 hover:text-white'
              }`}
              title="Vista ortogonal (ortográfica)"
            >
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <rect x="2.5" y="4.5" width="7.5" height="7.5" rx="0.5" />
                <path d="M6 4.5V2.5h7.5V10h-2" strokeLinejoin="round" />
              </svg>
              Ortogonal
            </button>
          </div>
        </div>

        {/* Right User / Auth Section */}
        <div className="flex items-center gap-2 shrink-0">
          {authLoading ? (
            <span className="text-xs text-asphalt-400">
              Verificando sesión...
            </span>
          ) : user ? (
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-2"
                title={`${user.displayName || user.email} (${user.email}) · ${currentProject ? `Rol: ${role}` : isSuperAdmin ? 'Superadmin' : 'Modo local'}`}
              >
                {avatarUrl && !avatarLoadFailed ? (
                  <img
                    src={avatarUrl}
                    alt={user.displayName || user.email}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarLoadFailed(true)}
                    className="w-7 h-7 rounded-full object-cover border border-pavasal-500/70 bg-asphalt-800 shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-pavasal-500/20 border border-pavasal-500/70 text-pavasal-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {getUserInitials(user.displayName, user.email)}
                  </div>
                )}

                <div className="hidden lg:flex flex-col items-start leading-tight">
                  <span className="text-xs font-medium text-asphalt-100 max-w-[140px] truncate">
                    {user.displayName || user.email}
                  </span>
                  <span className="text-[10px] text-pavasal-400 font-semibold uppercase">
                    {currentProject
                      ? `Rol: ${role}`
                      : isSuperAdmin
                        ? 'Superadmin'
                        : 'Modo local'}
                  </span>
                </div>
              </div>

              {canShowAdminGear && (
                <div ref={adminMenuRef} className="relative">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={isAdminMenuOpen}
                    onClick={() => setIsAdminMenuOpen((prev) => !prev)}
                    className={`p-1.5 rounded border transition-colors ${
                      isAdminMenuOpen
                        ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950'
                        : 'border-asphalt-700 bg-asphalt-800 text-asphalt-200 hover:border-pavasal-500/60 hover:text-pavasal-400'
                    }`}
                    title="Administración de proyecto y Drive"
                    aria-label="Administración de proyecto y Drive"
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      aria-hidden="true"
                    >
                      <path
                        d="M10 12.6a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M16.1 12.1a1.4 1.4 0 00.28 1.54l.05.05a1.7 1.7 0 11-2.4 2.4l-.05-.05a1.4 1.4 0 00-1.54-.28 1.4 1.4 0 00-.85 1.28v.14a1.7 1.7 0 11-3.4 0v-.07a1.4 1.4 0 00-.92-1.28 1.4 1.4 0 00-1.54.28l-.05.05a1.7 1.7 0 11-2.4-2.4l.05-.05a1.4 1.4 0 00.28-1.54 1.4 1.4 0 00-1.28-.85H2.8a1.7 1.7 0 110-3.4h.07a1.4 1.4 0 001.28-.92 1.4 1.4 0 00-.28-1.54l-.05-.05a1.7 1.7 0 112.4-2.4l.05.05a1.4 1.4 0 001.54.28h.07a1.4 1.4 0 00.85-1.28V2.8a1.7 1.7 0 113.4 0v.07a1.4 1.4 0 00.85 1.28 1.4 1.4 0 001.54-.28l.05-.05a1.7 1.7 0 112.4 2.4l-.05.05a1.4 1.4 0 00-.28 1.54v.07a1.4 1.4 0 001.28.85h.14a1.7 1.7 0 110 3.4h-.07a1.4 1.4 0 00-1.28.85Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {isAdminMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-1.5 w-56 rounded-md border border-asphalt-700 bg-asphalt-900 shadow-xl py-1 z-50 text-xs"
                    >
                      {!isSuperAdmin && (
                        <div className="px-3 py-1.5 border-b border-asphalt-800 text-[10px] font-semibold uppercase tracking-wider text-pavasal-400">
                          {currentProject
                            ? `${currentProject.name} (${role})`
                            : 'Administración global'}
                        </div>
                      )}

                      {(canManageProject || isSuperAdmin) && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openManagementTab('overview')}
                          className="w-full text-left px-3 py-2 text-asphalt-100 hover:bg-asphalt-800 hover:text-pavasal-400 transition-colors"
                        >
                          {currentProject
                            ? 'Resumen y Google Drive'
                            : 'Conectar Google Drive'}
                        </button>
                      )}

                      {currentProject && canManageMembers && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openManagementTab('members')}
                          className="w-full text-left px-3 py-2 text-asphalt-100 hover:bg-asphalt-800 hover:text-pavasal-400 transition-colors"
                        >
                          Gestionar miembros
                        </button>
                      )}

                      {canCreateProject && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openManagementTab('create')}
                          className="w-full text-left px-3 py-2 text-asphalt-100 hover:bg-asphalt-800 hover:text-pavasal-400 transition-colors"
                        >
                          + Nuevo proyecto
                        </button>
                      )}

                      {isSuperAdmin && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openManagementTab('settings')}
                          className="w-full text-left px-3 py-2 text-asphalt-100 hover:bg-asphalt-800 hover:text-pavasal-400 transition-colors border-t border-asphalt-800/80"
                        >
                          Configuración Superadmin
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => logout()}
                className="rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1 text-xs text-asphalt-200 hover:border-pavasal-500/50 hover:text-white transition-colors"
              >
                Salir
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {isMeasureMenuOpen && measureMenuPos && (
        <div
          ref={measureMenuRef}
          role="menu"
          style={{ left: measureMenuPos.x, top: measureMenuPos.y }}
          className="fixed z-50 w-58 rounded-md border border-asphalt-700 bg-asphalt-900 py-1 text-xs shadow-2xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleSelectMeasureMode('length')}
            className={`w-full px-3 py-2 text-left flex items-start gap-2.5 transition-colors ${
              measureMode === 'length'
                ? 'bg-pavasal-500/15 text-pavasal-300'
                : 'text-asphalt-100 hover:bg-asphalt-800 hover:text-pavasal-300'
            }`}
          >
            <svg
              className="w-3.5 h-3.5 mt-0.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M11.2 1.8l3 3-9.4 9.4-3-3 9.4-9.4Z" />
              <path d="M8.85 4.15l1.2 1.2M6.5 6.5l1.6 1.6M4.15 8.85l1.2 1.2" />
            </svg>
            <div className="min-w-0">
              <div className="font-semibold">Distancia</div>
              <div className="text-[10px] text-asphalt-400">
                Vértices, aristas y planos
              </div>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleSelectMeasureMode('area')}
            className={`w-full px-3 py-2 text-left flex items-start gap-2.5 transition-colors border-t border-asphalt-800/80 ${
              measureMode === 'area'
                ? 'bg-pavasal-500/15 text-pavasal-300'
                : 'text-asphalt-100 hover:bg-asphalt-800 hover:text-pavasal-300'
            }`}
          >
            <svg
              className="w-3.5 h-3.5 mt-0.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2.5 3.5h11v9h-11z" />
              <path d="M2.5 8h11M8 3.5v9" opacity="0.55" />
            </svg>
            <div className="min-w-0">
              <div className="font-semibold">Área</div>
              <div className="text-[10px] text-asphalt-400">
                Superficie de cara · Ctrl + clic suma
              </div>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleSelectMeasureMode('volume')}
            className={`w-full px-3 py-2 text-left flex items-start gap-2.5 transition-colors border-t border-asphalt-800/80 ${
              measureMode === 'volume'
                ? 'bg-pavasal-500/15 text-pavasal-300'
                : 'text-asphalt-100 hover:bg-asphalt-800 hover:text-pavasal-300'
            }`}
          >
            <svg
              className="w-3.5 h-3.5 mt-0.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5L8 1.8Z" />
              <path d="M8 8v6.2M8 8 13.5 5M8 8 2.5 5" />
            </svg>
            <div className="min-w-0">
              <div className="font-semibold">Volumen</div>
              <div className="text-[10px] text-asphalt-400">
                Volumen geométrico · Ctrl + clic suma
              </div>
            </div>
          </button>
        </div>
      )}

      <ProjectManagementModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        initialTab={modalInitialTab}
      />
    </>
  );
};

export default RibbonToolbar;
