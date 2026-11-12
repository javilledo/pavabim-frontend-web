import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectsService } from '../../api/projects.service';
import { useAuth } from '../../auth/AuthProvider';
import { useLocalFragUpload } from '../../hooks/useLocalFragUpload';
import { useProjectRole } from '../../hooks/useProjectRole';
import { useViewerStore, type ActiveTool } from '../../store/useViewerStore';
import { useEngine } from '../../viewer/EngineContext';
import { ProjectManagementModal } from '../projects/ProjectManagementModal';

export const RibbonToolbar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  const { user, loading: authLoading, logout } = useAuth();
  const { role } = useProjectRole();
  const { loadLocalFragFiles } = useLocalFragUpload();

  const {
    activeTool,
    cameraProjection,
    isGridVisible,
    isSectionActive,
    loadedModels,
    projects,
    currentProject,
    setActiveTool,
    setProjects,
    setCurrentProjectById,
    resetProjectContext,
  } = useViewerStore();

  const {
    isEngineReady,
    fitCameraToModels,
    setPlanView,
    toggleGridVisibility,
    toggleSectionBox,
    clearMeasurements,
    setCameraProjection,
  } = useEngine();

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

  const handleOpenLocalFrag = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    await loadLocalFragFiles(e.target.files);
    e.target.value = '';
  };

  const handleToolClick = (tool: ActiveTool) => {
    if (tool === 'section') {
      toggleSectionBox();
      setActiveTool(isSectionActive ? 'select' : 'section');
      return;
    }
    setActiveTool(tool);
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
                className="max-w-[200px] truncate rounded border border-asphalt-700 bg-asphalt-900 px-2.5 py-1 text-xs text-asphalt-100 focus:border-pavasal-500 focus:outline-none"
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
                      {proj.name} ({proj.myRole})
                    </option>
                  ))
                )}
              </select>

              <button
                type="button"
                onClick={() => setIsProjectModalOpen(true)}
                className="rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1 text-xs text-asphalt-100 hover:border-pavasal-500/60 hover:text-pavasal-400 transition-colors shrink-0"
                title="Gestionar proyecto, miembros y Google Drive"
              >
                Proyecto / Drive
              </button>
            </div>
          )}
        </div>

        {/* Center 3D Viewer Tools */}
        <div className="flex items-center gap-1 bg-asphalt-900 border border-asphalt-700 rounded-md px-1.5 py-1 min-w-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => handleToolClick('select')}
            className={`${toolBtnClass(activeTool === 'select')} whitespace-nowrap shrink-0`}
            title="Seleccionar elementos (Esc)"
          >
            Seleccionar
          </button>
          <button
            type="button"
            onClick={() => handleToolClick('pan')}
            className={`${toolBtnClass(activeTool === 'pan')} whitespace-nowrap shrink-0`}
            title="Panear vista"
          >
            Panear
          </button>
          <button
            type="button"
            onClick={() => handleToolClick('measure')}
            className={`${toolBtnClass(activeTool === 'measure')} whitespace-nowrap shrink-0`}
            title="Medición lineal"
          >
            Medir
          </button>
          <button
            type="button"
            onClick={() => handleToolClick('section')}
            className={`${toolBtnClass(
              isSectionActive || activeTool === 'section',
            )} whitespace-nowrap shrink-0`}
            title="Plano de corte (doble clic para crear plano)"
          >
            Sección
          </button>

          <div className="h-4 w-px bg-asphalt-700 mx-1 shrink-0" />

          <button
            type="button"
            onClick={() => fitCameraToModels()}
            disabled={loadedModels.length === 0 || !isEngineReady}
            className="px-2.5 py-1.5 rounded text-xs text-asphalt-200 hover:bg-asphalt-800 hover:text-white disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            title="Centrar cámara en modelos cargados"
          >
            Encuadrar
          </button>
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
              aria-hidden="true"
            >
              <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
              <path d="M2.5 7h5.5V2.5M8 13.5V9.5h5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Planta
          </button>
          <button
            type="button"
            onClick={() => toggleGridVisibility()}
            disabled={!isEngineReady}
            className={`${toolBtnClass(isGridVisible)} whitespace-nowrap shrink-0`}
            title="Mostrar/ocultar grilla"
          >
            Grilla
          </button>
          <button
            type="button"
            onClick={() => clearMeasurements()}
            disabled={!isEngineReady}
            className="px-2 py-1.5 rounded text-xs text-asphalt-300 hover:bg-asphalt-800 hover:text-white disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            title="Limpiar mediciones"
          >
            Limpiar
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

          <div className="h-4 w-px bg-asphalt-700 mx-1 shrink-0" />

          <input
            ref={fileInputRef}
            type="file"
            accept=".frag,.ifc"
            multiple
            onChange={handleOpenLocalFrag}
            className="hidden"
          />
          <button
            type="button"
            disabled={!isEngineReady}
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded text-xs font-semibold border border-pavasal-500/70 bg-pavasal-500/15 text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            title="Subir archivos .frag o .ifc locales sin necesidad de proyecto"
          >
            + .frag / .ifc local
          </button>
        </div>

        {/* Right User / Auth Section */}
        <div className="flex items-center gap-2 shrink-0">
          {authLoading ? (
            <span className="text-xs text-asphalt-400">
              Verificando sesión...
            </span>
          ) : user ? (
            <div className="flex items-center gap-2">
              <div className="hidden lg:flex flex-col items-end leading-tight">
                <span className="text-xs font-medium text-asphalt-100 max-w-[140px] truncate">
                  {user.displayName || user.email}
                </span>
                <span className="text-[10px] text-pavasal-400 font-semibold uppercase">
                  {currentProject ? `Rol: ${role}` : 'Modo local'}
                </span>
              </div>
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

      <ProjectManagementModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
      />
    </>
  );
};

export default RibbonToolbar;
