import apiClient from './client';
import type {
  AppSettings,
  AssignSuperAdminPayload,
  AssignSuperAdminResponse,
  SuperAdminEntry,
  UpdateSettingsPayload,
} from '../types/api.types';

export const settingsService = {
  async getSettings(): Promise<AppSettings> {
    const { data } = await apiClient.get<AppSettings>('/settings');
    return data;
  },

  async updateSettings(payload: UpdateSettingsPayload): Promise<AppSettings> {
    const { data } = await apiClient.put<AppSettings>('/settings', payload);
    return data;
  },

  async listSuperAdmins(): Promise<SuperAdminEntry[]> {
    const { data } = await apiClient.get<SuperAdminEntry[]>(
      '/settings/superadmins',
    );
    return data;
  },

  async assignSuperAdmin(
    payload: AssignSuperAdminPayload,
  ): Promise<AssignSuperAdminResponse> {
    const { data } = await apiClient.post<AssignSuperAdminResponse>(
      '/settings/superadmins',
      payload,
    );
    return data;
  },
};

export default settingsService;

