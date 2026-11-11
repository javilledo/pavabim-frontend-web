import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../api/client';
import { modelsService } from '../../api/models.service';
import { projectsService } from '../../api/projects.service';
import { useAuth } from '../../auth/AuthProvider';
import { useLocalFragUpload } from '../../hooks/useLocalFragUpload';
import { useProjectRole } from '../../hooks/useProjectRole';
import { useViewerStore } from '../../store/useViewerStore';
import type { ModelStatusResponse } from '../../types/api.types';
import { useEngine } from '../../viewer/EngineContext';

const STATUS_BADGE: Record<ModelStatusResponse['status'], string> = {
  READY: 'bg-emerald-950 text-emerald-300 border-emerald-700/60',
  PROCESSING:
    'bg-pavasal-950 text-pavasal-400 border-pavasal-500/60 animate-pulse',
  NOT_CONVERTED: 'bg-asphalt-900 text-asphalt-300 border-asphalt-600',
  FAILED: 'bg-red-950 text-red-300 border-red-700/60',
};

export const ModelsPanel: React.FC = () => {
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { canManageModels, canSyncDrive } = useProjectRole();
  const { loadLocalFragFiles } = useLocalFragUpload();
  const {
    loadedModels,
    isLoadingModel,
    loadingModelName,
    currentProject,
    setRemoteModels,
  } = useViewerStore();
  const {
    isEngineReady,
    loadModelFromBuffer,
    toggleModelVisibility,
    removeModel,
    fitCameraToModels,
  } = useEngine();

  const [loadingModelKey, setLoadingModelKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDraggingDropzone, setIsDraggingDropzone] = useState(false);

  const projectId = currentProject?.id || '';

  const modelsQuery = useQuery({
    queryKey: ['models', projectId],
    queryFn: () => modelsService.listProjectModels(projectId),
    enabled: Boolean(user && projectId),
    refetchInterval: (query) => {
      const items = query.state.data;
      return Array.isArray(items) && items.some((m) => m.status === 'PROCESSING')
        ? 4000
        : false;
    },
  });

  useEffect(() => {
    if (modelsQuery.data) {
      setRemoteModels(modelsQuery.data);
    }
  }, [modelsQuery.data, setRemoteModels]);

  const convertMutation = useMutation({
    mutationFn: (modelName: string) =>
      modelsService.triggerConversion(projectId, modelName),
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

  const handleLoadRemoteModel = async (model: ModelStatusResponse) => {
    if (!projectId || !isEngineReady) return;
    setActionError(null);
    setLoadingModelKey(model.modelName);

    try {
      const buffer = await modelsService.fetchFragBinary(
        projectId,
        model.modelName,
      );
      const modelId = model.ifcFileId || model.modelName;
      await loadModelFromBuffer(buffer, modelId, model.modelName, 'remote');
    } catch (err) {
      setActionError(
        getApiErrorMessage(err, 'No se pudo descargar el modelo .frag'),
      );
    } finally {
      setLoadingModelKey(null);
    }
  };

  const handleLocalInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await loadLocalFragFiles(e.target.files);
    e.target.value = '';
  };

  const handleDropLocal = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDropzone(false);
    await loadLocalFragFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Standalone Local .frag Upload Section (always available without project) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
            Carga local directa
          </h3>
        </div>

        <input
          ref={localInputRef}
          type="file"
          accept=".frag,.ifc"
          multiple
          onChange={handleLocalInput}
          className="hidden"
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingDropzone(true);
          }}
          onDragLeave={() => setIsDraggingDropzone(false)}
          onDrop={handleDropLocal}
          className={`rounded-md border border-dashed p-3 text-center transition-colors space-y-2 ${
            isDraggingDropzone
              ? 'border-pavasal-500 bg-pavasal-500/15'
              : 'border-asphalt-600 bg-asphalt-950/60 hover:border-pavasal-500/60'
          }`}
        >
          <p className="text-[11px] text-asphalt-300 leading-snug">
            Carga archivos <code className="text-pavasal-400">.frag</code> o{' '}
            <code className="text-pavasal-400">.ifc</code> en local (sin proyecto). Los{' '}
            <code className="text-pavasal-400">.ifc</code> se convierten al vuelo sin guardarse en Drive.
          </p>
          <button
            type="button"
            disabled={!isEngineReady || isLoadingModel}
            onClick={() => localInputRef.current?.click()}
            className="w-full rounded bg-pavasal-500 px-3 py-1.5 text-xs font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 transition-colors"
          >
            {isLoadingModel
              ? loadingModelName || 'Procesando...'
              : '+ Subir .frag o .ifc'}
          </button>
        </div>
      </section>

      {/* Loaded Models in 3D Scene */}
      <section className="space-y-2 pt-2 border-t border-asphalt-800">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
            En escena ({loadedModels.length})
          </h3>
          {loadedModels.length > 0 && (
            <button
              type="button"
              onClick={() => fitCameraToModels()}
              className="text-[11px] text-asphalt-300 hover:text-pavasal-400 transition-colors"
            >
              Encuadrar
            </button>
          )}
        </div>

        {loadedModels.length === 0 ? (
          <p className="text-center text-asphalt-400 py-2 text-[11px]">
            No hay modelos en escena todavía.
          </p>
        ) : (
          <div className="space-y-1.5">
            {loadedModels.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between gap-2 rounded border border-asphalt-700 bg-asphalt-800/70 px-2.5 py-2"
              >
                <label className="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={model.visible}
                    onChange={(e) =>
                      toggleModelVisibility(model.id, e.target.checked)
                    }
                    className="rounded border-asphalt-600 bg-asphalt-900 accent-pavasal-500 focus:ring-0"
                  />
                  <span
                    className="truncate font-medium text-asphalt-100"
                    title={model.name}
                  >
                    {model.name}
                  </span>
                </label>

                <div className="flex items-center gap-1.5 shrink-0">
                  {model.downloadUrl && (
                    <a
                      href={model.downloadUrl}
                      download={model.name}
                      className="rounded border border-pavasal-500/50 bg-pavasal-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950 transition-colors"
                      title="Descargar .frag generado en local"
                    >
                      ↓ .frag
                    </a>
                  )}
                  <span className="rounded bg-asphalt-950 border border-asphalt-700 px-1.5 py-0.5 text-[9px] uppercase text-asphalt-300">
                    {model.source === 'remote' ? 'Drive' : 'Local'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeModel(model.id)}
                    className="text-[11px] text-red-400 hover:text-red-300"
                    title="Descargar del visor"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Remote Project Models from Google Drive / Backend */}
      {user && currentProject && (
        <section className="space-y-2 pt-3 border-t border-asphalt-700">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
              Drive IFC / .frag ({currentProject.name})
            </h3>
            <div className="flex items-center gap-1.5">
              {canSyncDrive && (
                <button
                  type="button"
                  disabled={syncDriveMutation.isPending}
                  onClick={() => syncDriveMutation.mutate()}
                  className="rounded border border-asphalt-600 bg-asphalt-800 px-2 py-0.5 text-[11px] text-asphalt-200 hover:border-pavasal-500/60 hover:text-pavasal-400 disabled:opacity-50"
                >
                  {syncDriveMutation.isPending ? 'Sync...' : 'Sync Drive'}
                </button>
              )}
              <button
                type="button"
                onClick={() => modelsQuery.refetch()}
                className="rounded border border-asphalt-600 bg-asphalt-800 px-2 py-0.5 text-[11px] text-asphalt-200 hover:border-pavasal-500/60 hover:text-pavasal-400"
                title="Actualizar lista"
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
            <p className="text-asphalt-300 py-2">Escaneando modelos IFC...</p>
          ) : (modelsQuery.data || []).length === 0 ? (
            <p className="text-asphalt-400 py-2">
              No se encontraron modelos IFC en la carpeta origen del proyecto.
            </p>
          ) : (
            <div className="space-y-2">
              {(modelsQuery.data || []).map((model) => {
                const targetId = model.ifcFileId || model.modelName;
                const isLoaded = loadedModels.some((m) => m.id === targetId);
                const isLoadingThis = loadingModelKey === model.modelName;

                return (
                  <div
                    key={model.ifcFileId || model.modelName}
                    className="rounded border border-asphalt-700 bg-asphalt-800/70 p-2.5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="font-medium text-asphalt-100 break-all leading-snug"
                        title={model.modelName}
                      >
                        {model.modelName}
                      </span>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[model.status]}`}
                      >
                        {model.status}
                      </span>
                    </div>

                    {model.error && (
                      <p className="text-[11px] text-red-300">{model.error}</p>
                    )}

                    <div className="flex items-center gap-2">
                      {model.status === 'READY' && (
                        <button
                          type="button"
                          disabled={!isEngineReady || isLoadingThis || isLoaded}
                          onClick={() => handleLoadRemoteModel(model)}
                          className="flex-1 rounded bg-pavasal-500 px-2.5 py-1 text-[11px] font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 transition-colors"
                        >
                          {isLoaded
                            ? 'Cargado en visor'
                            : isLoadingThis
                              ? 'Descargando .frag...'
                              : 'Cargar en 3D'}
                        </button>
                      )}

                      {(model.status === 'NOT_CONVERTED' ||
                        model.status === 'FAILED') &&
                        canManageModels && (
                          <button
                            type="button"
                            disabled={convertMutation.isPending}
                            onClick={() =>
                              convertMutation.mutate(model.modelName)
                            }
                            className="flex-1 rounded border border-pavasal-500/80 bg-pavasal-500/10 px-2.5 py-1 text-[11px] font-semibold text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950 disabled:opacity-40 transition-colors"
                          >
                            {model.status === 'FAILED'
                              ? 'Reintentar conversión'
                              : 'Convertir IFC → .frag'}
                          </button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default ModelsPanel;
