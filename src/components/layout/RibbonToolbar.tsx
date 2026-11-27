import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectsService } from '../../api/projects.service';
import { useAuth } from '../../auth/AuthProvider';
import { useProjectRole } from '../../hooks/useProjectRole';
import { useViewerStore, type MeasureMode } from '../../store/useViewerStore';
import { useEngine } from '../../viewer/EngineContext';
import { SelectionAppearanceControls } from '../viewer/SelectionAppearanceControls';
import { ProjectManagementModal } from '../projects/ProjectManagementModal';

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
  const measureGroupRef = useRef<HTMLDivElement | null>(null);
  const measureMenuRef = useRef<HTMLDivElement | null>(null);
  const appearanceBtnRef = useRef<HTMLButtonElement | null>(null);
  const appearanceMenuRef = useRef<HTMLDivElement | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isMeasureMenuOpen, setIsMeasureMenuOpen] = useState(false);
  const [measureMenuPos, setMeasureMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [appearancePos, setAppearancePos] = useState<{ x: number; y: number } | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const { user, loading: authLoading, logout } = useAuth();
  const { role, isSuperAdmin, canAccessAdminPanel } = useProjectRole();

  const {
    activeTool,
    measureMode,
    cameraProjection,
    isGridVisible,
    isSectionActive,
    isSectionGizmosVisible,
    themeMode,
    loadedModels,
    selectedElementsMap,
    hiddenElementsMap,
    customAppearanceCount,
    isIsolationActive,
    projects,
    currentProject,
    setActiveTool,
    setMeasureMode,
    toggleThemeMode,
    setProjects,
    setCurrentProjectById,
    resetProjectContext,
  } = useViewerStore();

  const {
    isEngineReady,
    toggleGridVisibility,
    toggleSectionGizmosVisibility,
    clearSections,
    setCameraProjection,
    hideSelectedElements,
    isolateSelectedElements,
    showAllElements,
    resetAllCustomAppearances,
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

  const currentProjectId = currentProject?.id || null;
  const activeProjectLoadedModels = useMemo(
    () =>
      loadedModels.filter(
        (m) => !m.projectId || m.projectId === currentProjectId,
      ),
    [loadedModels, currentProjectId],
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

  useEffect(() => {
    if (!canAccessAdminPanel) {
      setIsProjectModalOpen(false);
    }
  }, [canAccessAdminPanel]);

  useEffect(() => {
    if (!isMeasureMenuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (
        target instanceof Node &&
        (measureMenuRef.current?.contains(target) ||
          measureGroupRef.current?.contains(target))
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

  useEffect(() => {
    if (selectedCount === 0 && isAppearanceOpen) {
      setIsAppearanceOpen(false);
    }
  }, [isAppearanceOpen, selectedCount]);

  useEffect(() => {
    if (!isAppearanceOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (
        target instanceof Node &&
        (appearanceMenuRef.current?.contains(target) ||
          appearanceBtnRef.current?.contains(target))
      ) {
        return;
      }
      setIsAppearanceOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAppearanceOpen(false);
      }
    };

    const closeOnResize = () => setIsAppearanceOpen(false);

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeOnResize);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [isAppearanceOpen]);

  const toggleAppearanceMenu = () => {
    if (isAppearanceOpen) {
      setIsAppearanceOpen(false);
      return;
    }
    const rect = appearanceBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const popoverWidth = 264;
    setAppearancePos({
      x: Math.min(rect.left, Math.max(8, window.innerWidth - popoverWidth - 8)),
      y: rect.bottom + 6,
    });
    setIsAppearanceOpen(true);
  };

  const toggleMeasureModeMenu = () => {
    if (isMeasureMenuOpen) {
      setIsMeasureMenuOpen(false);
      return;
    }
    const rect = measureGroupRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 232;
    setMeasureMenuPos({
      x: Math.min(rect.left, Math.max(8, window.innerWidth - menuWidth - 8)),
      y: rect.bottom + 6,
    });
    setIsMeasureMenuOpen(true);
  };

  const handleSelectMeasureMode = (mode: MeasureMode) => {
    setMeasureMode(mode);
    setActiveTool('measure');
    setIsMeasureMenuOpen(false);
  };

  const toggleMeasureTool = () => {
    setIsMeasureMenuOpen(false);
    setActiveTool(activeTool === 'measure' ? 'select' : 'measure');
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
          {/* Measure Split Button */}
          <div
            ref={measureGroupRef}
            className={`inline-flex items-stretch rounded transition-colors ${
              activeTool === 'measure'
                ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
                : 'text-asphalt-200 font-medium hover:bg-asphalt-800'
            }`}
          >
            {/* Primary Action: Run / Toggle current measure mode */}
            <button
              type="button"
              onClick={toggleMeasureTool}
              disabled={!isEngineReady}
              aria-pressed={activeTool === 'measure'}
              className="px-2.5 py-1.5 flex items-center gap-1.5 text-xs whitespace-nowrap disabled:opacity-40 rounded-l hover:bg-black/10 transition-colors"
              title={
                activeTool === 'measure'
                  ? `Desactivar ${
                      measureMode === 'area'
                        ? 'Área'
                        : measureMode === 'volume'
                          ? 'Volumen'
                          : measureMode === 'coordinates'
                            ? 'Coordenadas'
                            : 'Medir'
                    } (Esc)`
                  : `${
                      measureMode === 'area'
                        ? 'Medir Área'
                        : measureMode === 'volume'
                          ? 'Medir Volumen'
                          : measureMode === 'coordinates'
                            ? 'Consultar Coordenadas'
                            : 'Medir'
                    } (clic para activar)`
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
              ) : measureMode === 'coordinates' ? (
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
                    : measureMode === 'coordinates'
                      ? 'Coordenadas'
                      : 'Medir'}
              </span>
            </button>

            {/* Dropdown Arrow: Select other measurement options */}
            <button
              type="button"
              onClick={toggleMeasureModeMenu}
              disabled={!isEngineReady}
              aria-haspopup="menu"
              aria-expanded={isMeasureMenuOpen}
              className={`px-1.5 py-1.5 flex items-center justify-center border-l transition-colors rounded-r disabled:opacity-40 hover:bg-black/15 ${
                activeTool === 'measure'
                  ? 'border-asphalt-950/20 text-asphalt-950 hover:bg-black/10'
                  : 'border-asphalt-700/70 text-asphalt-300 hover:text-white'
              }`}
              title="Elegir tipo de medición (Medir, Área, Volumen, Coordenadas)"
            >
              <svg
                className={`w-3 h-3 transition-transform ${isMeasureMenuOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 10 10"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M2.2 3.6 5 6.6l2.8-3H2.2Z" />
              </svg>
            </button>
          </div>

          <div className="h-4 w-px bg-asphalt-700 mx-1 shrink-0" />

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
          <div className="h-4 w-px bg-asphalt-700 mx-1 shrink-0" />

          {/* Section / Clipping Planes Group */}
          <div
            role="group"
            aria-label="Planos de sección"
            className="flex items-center gap-0.5 rounded bg-asphalt-950/80 border border-asphalt-700/80 p-0.5 shrink-0"
          >
            {/* 1. Crear sección (Activar modo de selección de cara) */}
            <button
              type="button"
              onClick={() =>
                setActiveTool(activeTool === 'section' ? 'select' : 'section')
              }
              disabled={!isEngineReady}
              aria-pressed={activeTool === 'section'}
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 ${
                activeTool === 'section'
                  ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
                  : 'text-asphalt-200 font-medium hover:bg-asphalt-800 hover:text-white'
              }`}
              title={
                activeTool === 'section'
                  ? 'Cancelar selección de cara (Esc)'
                  : 'Crear sección (seleccionar cara con clic izquierdo)'
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
                <path d="M2 8h12" strokeDasharray="2 2" />
                <path d="M4.5 3.5v9M11.5 3.5v9" />
              </svg>
              <span>Crear sección</span>
            </button>

            {/* 2. Mostrar / Ocultar controles (gizmos) de sección */}
            <button
              type="button"
              onClick={() => toggleSectionGizmosVisibility()}
              disabled={!isEngineReady}
              aria-label="Mostrar u ocultar controles de sección"
              aria-pressed={!isSectionGizmosVisible}
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-40 ${
                !isSectionGizmosVisible
                  ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
                  : isSectionActive
                    ? 'text-pavasal-300 hover:bg-asphalt-800 hover:text-white font-medium'
                    : 'text-asphalt-200 font-medium hover:bg-asphalt-800 hover:text-white'
              }`}
              title={
                isSectionGizmosVisible
                  ? 'Mostrar/Ocultar controles de sección (actualmente visibles)'
                  : 'Mostrar/Ocultar controles de sección (actualmente ocultos)'
              }
            >
              {isSectionGizmosVisible ? (
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
                  <path d="M1.5 8C2.6 5.3 5.1 3.5 8 3.5S13.4 5.3 14.5 8c-1.1 2.7-3.6 4.5-6.5 4.5S2.6 10.7 1.5 8Z" />
                  <circle cx="8" cy="8" r="2" />
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
                  <path d="M2 2l12 12M6.5 6.6a2 2 0 0 0 2.9 2.8M4.3 4.5C2.8 5.4 1.8 6.8 1.5 8c.9 2.7 3.6 4.5 6.5 4.5 1.3 0 2.6-.4 3.7-1M9.2 3.7C11.7 4.2 13.8 5.9 14.5 8c-.4 1.1-1.1 2.1-2 2.9" />
                </svg>
              )}
            </button>

            {/* 3. Eliminar todas las secciones */}
            <button
              type="button"
              onClick={() => clearSections()}
              disabled={!isEngineReady || !isSectionActive}
              aria-label="Eliminar todas las secciones"
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-40 ${
                isSectionActive
                  ? 'text-red-300 hover:bg-red-500/20 hover:text-red-100 font-medium'
                  : 'text-asphalt-400 font-medium'
              }`}
              title={
                isSectionActive
                  ? 'Eliminar todas las secciones'
                  : 'Eliminar todas las secciones (no hay secciones activas)'
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
                <path d="M3 4.5h10M6.5 2.5h3M5 4.5v8.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4.5" />
                <path d="M6.8 7v4.5M9.2 7v4.5" />
              </svg>
            </button>
          </div>

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
            disabled={!isEngineReady || activeProjectLoadedModels.length === 0}
            className={`px-2.5 py-1.5 rounded text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              hiddenCount > 0 ||
              isIsolationActive ||
              activeProjectLoadedModels.some((m) => !m.visible)
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

          <button
            ref={appearanceBtnRef}
            type="button"
            disabled={!isEngineReady || selectedCount === 0}
            aria-haspopup="dialog"
            aria-expanded={isAppearanceOpen}
            onClick={toggleAppearanceMenu}
            className={`px-2.5 py-1.5 rounded text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              isAppearanceOpen
                ? 'bg-pavasal-500 text-asphalt-950 font-semibold shadow-sm'
                : 'text-asphalt-200 hover:bg-asphalt-800 hover:text-white'
            }`}
            title={
              selectedCount > 0
                ? `Cambiar color o transparencia de ${selectedCount} elemento${selectedCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'}`
                : 'Selecciona uno o más elementos para cambiar su color o transparencia'
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
              <path d="M8 2a6 6 0 1 0 0 12h1.2a1.8 1.8 0 0 0 1.4-2.9l-.3-.4a1.5 1.5 0 0 1 1.2-2.4H13A1 1 0 0 0 14 7.3 6 6 0 0 0 8 2Z" />
              <circle cx="5.2" cy="6.6" r="0.8" fill="currentColor" stroke="none" />
              <circle cx="8" cy="5.2" r="0.8" fill="currentColor" stroke="none" />
              <circle cx="10.8" cy="6.6" r="0.8" fill="currentColor" stroke="none" />
              <circle cx="5.6" cy="9.8" r="0.8" fill="currentColor" stroke="none" />
            </svg>
            Apariencia
          </button>

          <button
            type="button"
            onClick={() => void resetAllCustomAppearances()}
            disabled={!isEngineReady || customAppearanceCount === 0}
            className={`px-2.5 py-1.5 rounded text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              customAppearanceCount > 0
                ? 'bg-pavasal-500/15 border border-pavasal-500/50 text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950'
                : 'text-asphalt-200 hover:bg-asphalt-800 hover:text-white'
            }`}
            title={
              customAppearanceCount > 0
                ? `Restablecer visualización (${customAppearanceCount} elemento${customAppearanceCount === 1 ? '' : 's'} con color o transparencia modificados)`
                : 'Restablecer visualización (no hay colores ni transparencias modificados)'
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
              <path d="M3 7a5 5 0 1 1 1.2 4.3M3 4v3h3" />
            </svg>
            Restablecer visualización
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

              <button
                type="button"
                onClick={toggleThemeMode}
                className="p-1.5 rounded border border-asphalt-700 bg-asphalt-800 text-asphalt-200 hover:border-pavasal-500/60 hover:text-pavasal-400 transition-colors"
                title={
                  themeMode === 'dark'
                    ? 'Cambiar a modo claro'
                    : 'Cambiar a modo oscuro'
                }
                aria-label={
                  themeMode === 'dark'
                    ? 'Cambiar a modo claro'
                    : 'Cambiar a modo oscuro'
                }
              >
                {themeMode === 'dark' ? (
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="10" cy="10" r="3.6" />
                    <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M15.3 4.7L14 6M6 14l-1.3 1.3" />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M16.2 12.6A6.5 6.5 0 0 1 7.4 3.8a6.8 6.8 0 1 0 8.8 8.8Z" />
                  </svg>
                )}
              </button>

              {canAccessAdminPanel && (
                <button
                  type="button"
                  onClick={() => setIsProjectModalOpen(true)}
                  className={`p-1.5 rounded border transition-colors ${
                    isProjectModalOpen
                      ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950'
                      : 'border-asphalt-700 bg-asphalt-800 text-asphalt-200 hover:border-pavasal-500/60 hover:text-pavasal-400'
                  }`}
                  title="Panel de administración"
                  aria-label="Panel de administración"
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
              <div className="font-semibold">Medir</div>
              <div className="text-[10px] text-asphalt-400">
                Distancia entre vértices, aristas y planos
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

          <button
            type="button"
            role="menuitem"
            onClick={() => handleSelectMeasureMode('coordinates')}
            className={`w-full px-3 py-2 text-left flex items-start gap-2.5 transition-colors border-t border-asphalt-800/80 ${
              measureMode === 'coordinates'
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
              <circle cx="8" cy="8" r="4.5" />
              <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
            </svg>
            <div className="min-w-0">
              <div className="font-semibold">Coordenadas</div>
              <div className="text-[10px] text-asphalt-400">
                Consulta coordenadas X, Y, Z de un vértice
              </div>
            </div>
          </button>
        </div>
      )}

      {isAppearanceOpen && appearancePos && selectedCount > 0 && (
        <div
          ref={appearanceMenuRef}
          role="dialog"
          aria-label="Apariencia de elementos seleccionados"
          style={{ left: appearancePos.x, top: appearancePos.y }}
          className="fixed z-50 w-[264px] rounded-lg border border-asphalt-700 bg-asphalt-900/95 backdrop-blur p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-asphalt-800">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
              Apariencia ({selectedCount})
            </span>
            <button
              type="button"
              onClick={() => setIsAppearanceOpen(false)}
              className="text-asphalt-400 hover:text-white text-xs leading-none px-1"
              title="Cerrar"
            >
              ✕
            </button>
          </div>
          <SelectionAppearanceControls />
        </div>
      )}

      <ProjectManagementModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
      />
    </>
  );
};

export default RibbonToolbar;
