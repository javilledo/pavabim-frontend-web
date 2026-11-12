import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../api/client';
import { isModelOutdated, modelsService } from '../../api/models.service';
import { projectsService } from '../../api/projects.service';
import { useAuth } from '../../auth/AuthProvider';
import { useProjectModelsQuery } from '../../hooks/useAutoConvertProjectModels';
import { useProjectRole } from '../../hooks/useProjectRole';
import { useViewerStore } from '../../store/useViewerStore';
import type { ModelStatusResponse } from '../../types/api.types';
import { useEngine } from '../../viewer/EngineContext';

const STATUS_DOT: Record<
  ModelStatusResponse['status'],
  { color: string; label: string }
> = {
  READY: { color: 'bg-emerald-400', label: 'Convertido (.frag listo)' },
  PROCESSING: {
    color: 'bg-pavasal-400 animate-pulse',
    label: 'Convirtiendo IFC a .frag...',
  },
  NOT_CONVERTED: {
    color: 'bg-asphalt-400',
    label: 'Sin convertir (.ifc)',
  },
  FAILED: { color: 'bg-red-400', label: 'Error al convertir' },
};

export const ModelsPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { canManageModels, canSyncDrive } = useProjectRole();
  const { loadedModels, currentProject, setRemoteModels } = useViewerStore();
  const {
    isEngineReady,
    loadModelFromBuffer,
    toggleModelVisibility,
    removeModel,
    fitCameraToModels,
  } = useEngine();

  const [loadingModelKey, setLoadingModelKey] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const projectId = currentProject?.id || '';

  const modelsQuery = useProjectModelsQuery(projectId);

  useEffect(() => {
    if (modelsQuery.data) {
      setRemoteModels(modelsQuery.data);
    }
  }, [modelsQuery.data, setRemoteModels]);

  const convertMutation = useMutation({
    mutationFn: ({ modelName, force }: { modelName: string; force?: boolean }) =>
      modelsService.triggerConversion(projectId, modelName, { force }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['models', projectId] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err)),
  });

  const syncDriveMutation = useMutation({
    mutationFn: () => projectsService.syncDrive(projectId),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['models', projectId] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err)),
  });

  const loadRemoteModel = async (model: ModelStatusResponse) => {
    if (!projectId || !isEngineReady) return;
    setLoadingModelKey(model.modelName);
    try {
      const cacheVersion = model.fragModifiedTime || undefined;
      const buffer = await modelsService.fetchFragBinary(
        projectId,
        model.modelName,
        cacheVersion,
      );
      const modelId = model.ifcFileId || model.modelName;
      await loadModelFromBuffer(
        buffer,
        modelId,
        model.modelName,
        'remote',
        undefined,
        {
          fragModifiedTime: model.fragModifiedTime,
          projectId,
        },
      );
    } finally {
      setLoadingModelKey(null);
    }
  };

  const handleLoadRemoteModel = async (model: ModelStatusResponse) => {
    if (!projectId || !isEngineReady) return;
    setActionError(null);
    try {
      await loadRemoteModel(model);
    } catch (err) {
      setActionError(
        getApiErrorMessage(err, 'No se pudo descargar el modelo .frag'),
      );
    }
  };

  const projectModels = useMemo(() => {
    const raw = modelsQuery.data || [];
    return [...raw].sort((a, b) =>
      a.modelName.localeCompare(b.modelName, 'es', {
        numeric: true,
        sensitivity: 'base',
      }),
    );
  }, [modelsQuery.data]);

  if (!user || !currentProject) {
    return (
      <div className="rounded border border-asphalt-800 bg-asphalt-950/50 p-3 text-center text-[11px] text-asphalt-400 leading-relaxed">
        Selecciona un proyecto en la barra superior para ver los modelos de su
        carpeta, o arrastra archivos <span className="text-pavasal-400 font-medium">.frag / .ifc</span> al visor.
      </div>
    );
  }

  const readyModels = projectModels.filter((m) => m.status === 'READY');
  const pendingReadyModels = readyModels.filter((m) => {
    const targetId = m.ifcFileId || m.modelName;
    return !loadedModels.some((loaded) => loaded.id === targetId);
  });

  const handleLoadAllModels = async () => {
    if (!projectId || !isEngineReady || pendingReadyModels.length === 0) return;

    const targets = [...pendingReadyModels];
    setActionError(null);
    setBatchProgress({ current: 0, total: targets.length });

    let loadedCount = 0;
    const failedModels: string[] = [];

    try {
      for (let i = 0; i < targets.length; i++) {
        setBatchProgress({ current: i + 1, total: targets.length });
        try {
          await loadRemoteModel(targets[i]);
          loadedCount++;
        } catch {
          failedModels.push(targets[i].modelName);
        }
      }

      if (loadedCount > 0) {
        await fitCameraToModels();
      }

      if (failedModels.length > 0) {
        setActionError(
          `No se pudieron cargar: ${failedModels.join(', ')}`,
        );
      }
    } finally {
      setBatchProgress(null);
    }
  };

  return (
    <div className="space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-asphalt-800">
        <div className="min-w-0">
          <h3
            className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400 truncate"
            title={currentProject.name}
          >
            {currentProject.name}
          </h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canSyncDrive && (
            <button
              type="button"
              disabled={syncDriveMutation.isPending}
              onClick={() => syncDriveMutation.mutate()}
              className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-0.5 text-[11px] text-asphalt-200 hover:border-pavasal-500/60 hover:text-pavasal-400 disabled:opacity-50 transition-colors"
              title="Sincronizar carpeta de Google Drive"
            >
              {syncDriveMutation.isPending ? 'Sync...' : 'Sync Drive'}
            </button>
          )}
          <button
            type="button"
            onClick={() => modelsQuery.refetch()}
            className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-0.5 text-[11px] text-asphalt-200 hover:border-pavasal-500/60 hover:text-pavasal-400 transition-colors"
            title="Actualizar listado"
          >
            ↻
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded border border-red-700/70 bg-red-950/60 p-2 text-[11px] text-red-200">
          {actionError}
        </div>
      )}

      {modelsQuery.isError && (
        <div className="rounded border border-red-700/70 bg-red-950/60 p-2 text-[11px] text-red-200">
          {getApiErrorMessage(modelsQuery.error)}
        </div>
      )}

      {modelsQuery.isLoading ? (
        <p className="text-asphalt-300 py-2 text-[11px]">
          Escaneando modelos del proyecto...
        </p>
      ) : projectModels.length === 0 ? (
        <p className="text-asphalt-400 py-2 text-[11px]">
          No hay modelos en la carpeta del proyecto.
        </p>
      ) : (
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={
              !isEngineReady ||
              batchProgress !== null ||
              loadingModelKey !== null ||
              pendingReadyModels.length === 0
            }
            onClick={() => void handleLoadAllModels()}
            className="w-full rounded border border-pavasal-500/70 bg-pavasal-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950 disabled:border-asphalt-700 disabled:bg-asphalt-900/60 disabled:text-asphalt-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            title={
              readyModels.length === 0
                ? 'No hay modelos .frag convertidos listos para cargar'
                : pendingReadyModels.length === 0
                  ? 'Todos los modelos listos ya están cargados en escena'
                  : 'Cargar todos los modelos disponibles en el visor 3D'
            }
          >
            {batchProgress ? (
              <>
                <svg
                  className="w-3.5 h-3.5 animate-spin shrink-0"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path
                    d="M13.5 8a5.5 5.5 0 11-1.6-3.9"
                    strokeLinecap="round"
                  />
                </svg>
                Cargando {batchProgress.current}/{batchProgress.total}...
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5 shrink-0"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  aria-hidden="true"
                >
                  <path
                    d="M8 2.5L13 5.2v5.6L8 13.5 3 10.8V5.2L8 2.5Z"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 5.2L8 8l5-2.8M8 8v5.5"
                    strokeLinejoin="round"
                  />
                </svg>
                {readyModels.length === 0
                  ? 'Sin .frag listos para cargar'
                  : pendingReadyModels.length === 0
                    ? 'Todos los modelos cargados'
                    : `Cargar todos (${pendingReadyModels.length})`}
              </>
            )}
          </button>

          <div className="space-y-1">
            {projectModels.map((model) => {
            const targetId = model.ifcFileId || model.modelName;
            const loadedModel = loadedModels.find((m) => m.id === targetId);
            const isLoaded = Boolean(loadedModel);
            const isVisible = loadedModel?.visible ?? false;
            const isLoadingThis = loadingModelKey === model.modelName;
            const isOutdated = isModelOutdated(model);
            const isConvertingThis =
              model.status === 'PROCESSING' ||
              (convertMutation.isPending &&
                convertMutation.variables?.modelName === model.modelName);
            const canConvert =
              model.status !== 'PROCESSING' &&
              canManageModels &&
              !isConvertingThis;
            const canLoadOrUnload =
              isEngineReady &&
              batchProgress === null &&
              !isLoadingThis &&
              (isLoaded || model.status === 'READY');

            const statusInfo = isOutdated
              ? {
                  color: 'bg-amber-400',
                  label: 'IFC más reciente que .frag (requiere reconversión)',
                }
              : STATUS_DOT[model.status];

            const convertTitle = isConvertingThis
              ? 'Convirtiendo IFC a .frag...'
              : !canManageModels
                ? 'Sin permisos para convertir'
                : model.status === 'FAILED'
                  ? 'Reintentar conversión IFC → .frag'
                  : isOutdated
                    ? 'IFC más reciente detectado: reconvertir a .frag'
                    : model.status === 'READY'
                      ? 'Forzar nueva conversión IFC → .frag'
                      : 'Convertir IFC a .frag';

            const loadTitle = isLoadingThis
              ? 'Cargando modelo en el visor...'
              : isLoaded
                ? 'Descargar del visor 3D'
                : model.status !== 'READY'
                  ? 'Convierte primero el IFC a .frag para cargarlo'
                  : 'Cargar modelo en el visor 3D';

            return (
              <div
                key={targetId}
                className="rounded border border-asphalt-700/80 bg-asphalt-800/60 px-2 py-1.5 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${statusInfo.color}`}
                      title={statusInfo.label}
                    />
                    <span
                      className={`truncate text-[11px] font-medium ${
                        isLoaded && !isVisible
                          ? 'text-asphalt-400'
                          : 'text-asphalt-100'
                      }`}
                      title={model.modelName}
                    >
                      {model.modelName}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Show / Hide in scene */}
                    <button
                      type="button"
                      disabled={!loadedModel}
                      onClick={() =>
                        loadedModel &&
                        toggleModelVisibility(loadedModel.id, !isVisible)
                      }
                      aria-label={
                        !loadedModel
                          ? 'Modelo no cargado'
                          : isVisible
                            ? `Ocultar ${model.modelName}`
                            : `Mostrar ${model.modelName}`
                      }
                      title={
                        !loadedModel
                          ? 'Carga el modelo para mostrar/ocultar'
                          : isVisible
                            ? 'Ocultar en escena'
                            : 'Mostrar en escena'
                      }
                      className={`p-1 rounded border transition-colors ${
                        !loadedModel
                          ? 'border-transparent text-asphalt-500 opacity-35 cursor-not-allowed'
                          : isVisible
                            ? 'border-asphalt-600 bg-asphalt-900 text-asphalt-100 hover:border-pavasal-500/60 hover:text-pavasal-400'
                            : 'border-asphalt-700 bg-asphalt-950 text-asphalt-400 hover:border-pavasal-500/60 hover:text-white'
                      }`}
                    >
                      {loadedModel && !isVisible ? (
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          aria-hidden="true"
                        >
                          <path
                            d="M2 2l12 12M6.6 6.7A2 2 0 009.3 9.4M4.3 4.5C2.9 5.4 1.9 6.7 1.5 8c1.1 2.7 3.6 4.5 6.5 4.5 1.1 0 2.1-.3 3-.7M7 3.6c.3 0 .7-.1 1-.1 2.9 0 5.4 1.8 6.5 4.5-.4 1-1.1 1.9-1.9 2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-3.5 h-3.5"
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
                      )}
                    </button>

                    {/* Convert / Force Reconvert IFC -> FRAG */}
                    <button
                      type="button"
                      disabled={!canConvert}
                      onClick={() =>
                        convertMutation.mutate({
                          modelName: model.modelName,
                          force: model.status === 'READY' || isOutdated,
                        })
                      }
                      aria-label={
                        model.status === 'READY'
                          ? `Forzar reconversión de ${model.modelName} de IFC a FRAG`
                          : `Convertir ${model.modelName} de IFC a FRAG`
                      }
                      title={convertTitle}
                      className={`p-1 rounded border transition-colors ${
                        isConvertingThis
                          ? 'border-pavasal-500/50 bg-pavasal-500/15 text-pavasal-400 cursor-wait'
                          : canConvert && model.status === 'FAILED'
                            ? 'border-red-700/70 bg-red-950/60 text-red-300 hover:bg-red-500 hover:text-white'
                            : canConvert && isOutdated
                              ? 'border-amber-500/80 bg-amber-500/15 text-amber-300 hover:bg-amber-500 hover:text-asphalt-950'
                              : canConvert && model.status === 'READY'
                                ? 'border-emerald-700/70 bg-emerald-950/40 text-emerald-300 hover:border-pavasal-500 hover:bg-pavasal-500 hover:text-asphalt-950'
                                : canConvert
                                  ? 'border-pavasal-500/70 bg-pavasal-500/10 text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950'
                                  : 'border-transparent text-asphalt-500 opacity-35 cursor-not-allowed'
                      }`}
                    >
                      {isConvertingThis ? (
                        <svg
                          className="w-3.5 h-3.5 animate-spin"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden="true"
                        >
                          <path
                            d="M13.5 8a5.5 5.5 0 11-1.6-3.9"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          aria-hidden="true"
                        >
                          <path
                            d="M12.5 5.5A4.8 4.8 0 004.3 4.3L2.8 5.8M2.8 3v2.8h2.8M3.5 10.5a4.8 4.8 0 008.2 1.2l1.5-1.5M13.2 13v-2.8h-2.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>

                    {/* Load into / Unload from 3D scene */}
                    <button
                      type="button"
                      disabled={!canLoadOrUnload}
                      onClick={() =>
                        loadedModel
                          ? void removeModel(loadedModel.id)
                          : void handleLoadRemoteModel(model)
                      }
                      aria-label={
                        isLoaded
                          ? `Descargar ${model.modelName} del visor 3D`
                          : `Cargar ${model.modelName} en el visor 3D`
                      }
                      title={loadTitle}
                      className={`group p-1 rounded border transition-colors ${
                        isLoadingThis
                          ? 'border-pavasal-500/50 bg-pavasal-500/20 text-pavasal-400 cursor-wait'
                          : isLoaded
                            ? 'border-emerald-600/60 bg-emerald-950/70 text-emerald-300 hover:border-red-500/70 hover:bg-red-950/70 hover:text-red-300'
                            : canLoadOrUnload
                              ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950 hover:bg-pavasal-400'
                              : 'border-transparent text-asphalt-500 opacity-35 cursor-not-allowed'
                      }`}
                    >
                      {isLoadingThis ? (
                        <svg
                          className="w-3.5 h-3.5 animate-spin"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden="true"
                        >
                          <path
                            d="M13.5 8a5.5 5.5 0 11-1.6-3.9"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : isLoaded ? (
                        <>
                          <svg
                            className="w-3.5 h-3.5 group-hover:hidden"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            aria-hidden="true"
                          >
                            <path
                              d="M3.5 8.5l3 3 6-6.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <svg
                            className="w-3.5 h-3.5 hidden group-hover:block"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            aria-hidden="true"
                          >
                            <path
                              d="M4 4l8 8M12 4l-8 8"
                              strokeLinecap="round"
                            />
                          </svg>
                        </>
                      ) : (
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          aria-hidden="true"
                        >
                          <path
                            d="M8 2.5L13 5.2v5.6L8 13.5 3 10.8V5.2L8 2.5Z"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M3 5.2L8 8l5-2.8M8 8v5.5"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {model.error && (
                  <p className="text-[10px] text-red-300 break-words leading-tight pl-3.5">
                    {model.error}
                  </p>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelsPanel;
