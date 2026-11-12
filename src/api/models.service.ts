import apiClient from './client';
import type {
  ModelPropertiesDocument,
  ModelStatusResponse,
} from '../types/api.types';

export interface TriggerConversionOptions {
  force?: boolean;
}

export function isModelOutdated(model: ModelStatusResponse): boolean {
  if (model.needsReconversion || model.isOutdated) {
    return true;
  }
  const ifcRaw = model.ifcModifiedTime ?? model.ifcUpdatedAt;
  const fragRaw = model.fragModifiedTime ?? model.updatedAt;
  if (!ifcRaw || !fragRaw) {
    return false;
  }
  const ifcMs = Date.parse(ifcRaw);
  const fragMs = Date.parse(fragRaw);
  return Number.isFinite(ifcMs) && Number.isFinite(fragMs) && ifcMs > fragMs;
}

export const modelsService = {
  async listProjectModels(projectId: string): Promise<ModelStatusResponse[]> {
    const { data } = await apiClient.get<ModelStatusResponse[]>(
      `/projects/${encodeURIComponent(projectId)}/models`,
    );
    return data;
  },

  async triggerConversion(
    projectId: string,
    modelName: string,
    options?: TriggerConversionOptions,
  ): Promise<ModelStatusResponse> {
    const force = Boolean(options?.force);
    const { data } = await apiClient.post<ModelStatusResponse>(
      `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelName)}/convert`,
      force ? { force: true } : undefined,
      {
        params: force ? { force: true } : undefined,
        timeout: 180000,
      },
    );
    return data;
  },

  async fetchFragBinary(
    projectId: string,
    modelName: string,
    cacheVersion?: string,
  ): Promise<ArrayBuffer> {
    const normalizedVersion = cacheVersion?.trim() || undefined;
    const { data } = await apiClient.get<ArrayBuffer>(
      `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelName)}/frag`,
      {
        params: normalizedVersion ? { v: normalizedVersion } : undefined,
        responseType: 'arraybuffer',
        timeout: 180000,
      },
    );
    return data;
  },

  async fetchPropertiesJson(
    projectId: string,
    modelName: string,
    cacheVersion?: string,
  ): Promise<ModelPropertiesDocument> {
    const normalizedVersion = cacheVersion?.trim() || undefined;
    const { data } = await apiClient.get<ModelPropertiesDocument>(
      `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelName)}/properties`,
      {
        params: normalizedVersion ? { v: normalizedVersion } : undefined,
        timeout: 60000,
      },
    );
    return data;
  },

  /**
   * Sends a local .ifc file to the backend for stateless in-memory conversion
   * and receives the resulting binary .frag directly without storing anything in any project/Drive.
   */
  async convertLocalIfcToFrag(
    file: File,
    onUploadProgress?: (percent: number) => void,
  ): Promise<ArrayBuffer> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    const { data } = await apiClient.post<ArrayBuffer>(
      '/models/convert-local',
      formData,
      {
        responseType: 'arraybuffer',
        timeout: 300000,
        onUploadProgress: (progressEvent) => {
          if (onUploadProgress && progressEvent.total) {
            const pct = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            onUploadProgress(pct);
          }
        },
      },
    );

    return data;
  },
};

export default modelsService;
