import apiClient from './client';
import type {
  ModelPropertiesDocument,
  ModelStatusResponse,
} from '../types/api.types';

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
  ): Promise<ModelStatusResponse> {
    const { data } = await apiClient.post<ModelStatusResponse>(
      `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelName)}/convert`,
      undefined,
      { timeout: 180000 },
    );
    return data;
  },

  async fetchFragBinary(
    projectId: string,
    modelName: string,
  ): Promise<ArrayBuffer> {
    const { data } = await apiClient.get<ArrayBuffer>(
      `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelName)}/frag`,
      {
        responseType: 'arraybuffer',
        timeout: 180000,
      },
    );
    return data;
  },

  async fetchPropertiesJson(
    projectId: string,
    modelName: string,
  ): Promise<ModelPropertiesDocument> {
    const { data } = await apiClient.get<ModelPropertiesDocument>(
      `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelName)}/properties`,
      { timeout: 60000 },
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
