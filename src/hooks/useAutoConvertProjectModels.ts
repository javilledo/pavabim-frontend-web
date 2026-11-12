import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isModelOutdated, modelsService } from '../api/models.service';
import { useAuth } from '../auth/AuthProvider';
import { useViewerStore } from '../store/useViewerStore';
import type { ModelStatusResponse } from '../types/api.types';
import { useEngine } from '../viewer/EngineContext';

export function useProjectModelsQuery(projectId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['models', projectId],
    queryFn: () => modelsService.listProjectModels(projectId),
    enabled: Boolean(user && projectId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      const items = query.state.data;
      return Array.isArray(items) && items.some((m) => m.status === 'PROCESSING')
        ? 4000
        : false;
    },
  });
}

function getConversionSignature(projectId: string, model: ModelStatusResponse): string {
  const ifcTime = model.ifcModifiedTime ?? model.ifcUpdatedAt ?? '';
  const fragTime = model.fragModifiedTime ?? model.updatedAt ?? '';
  return `${projectId}:${model.modelName}:${model.ifcFileId}:${ifcTime}:${fragTime}:${model.status}`;
}

export function useAutoConvertProjectModels(): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentProject = useViewerStore((state) => state.currentProject);
  const loadedModels = useViewerStore((state) => state.loadedModels);
  const setRemoteModels = useViewerStore((state) => state.setRemoteModels);
  const { isEngineReady, loadModelFromBuffer, removeModel } = useEngine();

  const projectId = currentProject?.id || '';
  const modelsQuery = useProjectModelsQuery(projectId);

  const triggeredKeysRef = useRef<Set<string>>(new Set());
  const pendingUpdateKeysRef = useRef<Set<string>>(new Set());
  const inFlightReloadKeysRef = useRef<Set<string>>(new Set());
  const reloadedVersionKeysRef = useRef<Set<string>>(new Set());
  const activeProjectIdRef = useRef(projectId);
  activeProjectIdRef.current = projectId;

  useEffect(() => {
    if (modelsQuery.data) {
      setRemoteModels(modelsQuery.data);
    }
  }, [modelsQuery.data, setRemoteModels]);

  useEffect(() => {
    if (!user || !projectId || !modelsQuery.data || modelsQuery.data.length === 0) {
      return;
    }

    const candidates = modelsQuery.data.filter((model) => {
      const needsInitial = model.status === 'NOT_CONVERTED';
      const needsReconvert =
        !needsInitial &&
        model.status !== 'PROCESSING' &&
        model.status !== 'FAILED' &&
        isModelOutdated(model);
      if (!needsInitial && !needsReconvert) return false;
      const sig = getConversionSignature(projectId, model);
      return !triggeredKeysRef.current.has(sig);
    });

    if (candidates.length === 0) {
      return;
    }

    const runAutoConversions = async () => {
      let triggeredAny = false;
      for (const model of candidates) {
        if (activeProjectIdRef.current !== projectId) break;
        const sig = getConversionSignature(projectId, model);
        triggeredKeysRef.current.add(sig);
        const force = model.status !== 'NOT_CONVERTED';
        try {
          await modelsService.triggerConversion(projectId, model.modelName, { force });
          triggeredAny = true;
        } catch (err) {
          console.warn(
            `[AutoConvert] No se pudo iniciar conversión automática para ${model.modelName}:`,
            err,
          );
        }
      }
      if (activeProjectIdRef.current === projectId && triggeredAny) {
        void queryClient.invalidateQueries({ queryKey: ['models', projectId] });
      }
    };

    void runAutoConversions();
  }, [modelsQuery.data, projectId, queryClient, user]);

  useEffect(() => {
    if (!user || !projectId || !isEngineReady || !modelsQuery.data || modelsQuery.data.length === 0) {
      return;
    }

    for (const model of modelsQuery.data) {
      const targetId = model.ifcFileId || model.modelName;
      const modelKey = `${projectId}:${targetId}`;
      const outdated = isModelOutdated(model);

      if (model.status === 'PROCESSING' || outdated) {
        pendingUpdateKeysRef.current.add(modelKey);
        continue;
      }

      if (model.status !== 'READY') {
        continue;
      }

      const loadedModel = loadedModels.find(
        (m) =>
          m.id === targetId &&
          m.source === 'remote' &&
          (!m.projectId || m.projectId === projectId),
      );
      if (!loadedModel) {
        pendingUpdateKeysRef.current.delete(modelKey);
        continue;
      }

      const nextVersion = model.fragModifiedTime || undefined;
      const versionChanged = nextVersion
        ? loadedModel.fragModifiedTime !== nextVersion
        : pendingUpdateKeysRef.current.has(modelKey);

      if (!versionChanged) {
        pendingUpdateKeysRef.current.delete(modelKey);
        continue;
      }

      const versionKey = `${modelKey}:${nextVersion ?? 'reloaded'}`;
      if (
        inFlightReloadKeysRef.current.has(versionKey) ||
        reloadedVersionKeysRef.current.has(versionKey)
      ) {
        continue;
      }

      inFlightReloadKeysRef.current.add(versionKey);

      const reloadUpdatedModel = async () => {
        try {
          const buffer = await modelsService.fetchFragBinary(
            projectId,
            model.modelName,
            nextVersion,
          );

          if (activeProjectIdRef.current !== projectId) return;
          const currentLoaded = useViewerStore
            .getState()
            .loadedModels.find((m) => m.id === targetId && m.source === 'remote');
          if (!currentLoaded) return;

          await removeModel(targetId);
          await loadModelFromBuffer(
            buffer,
            targetId,
            model.modelName,
            'remote',
            undefined,
            {
              fragModifiedTime: nextVersion,
              projectId,
              skipCameraFit: true,
              initialVisible: currentLoaded.visible,
            },
          );

          reloadedVersionKeysRef.current.add(versionKey);
          pendingUpdateKeysRef.current.delete(modelKey);
          void queryClient.invalidateQueries({
            queryKey: ['model-properties', projectId, model.modelName],
          });
        } catch (err) {
          console.warn(
            `[AutoReload] No se pudo recargar el modelo actualizado ${model.modelName}:`,
            err,
          );
        } finally {
          inFlightReloadKeysRef.current.delete(versionKey);
        }
      };

      void reloadUpdatedModel();
    }
  }, [
    isEngineReady,
    loadModelFromBuffer,
    loadedModels,
    modelsQuery.data,
    projectId,
    queryClient,
    removeModel,
    user,
  ]);
}

