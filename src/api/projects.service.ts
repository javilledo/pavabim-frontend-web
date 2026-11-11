import apiClient from './client';
import type {
  AddMemberPayload,
  CreateProjectPayload,
  DeleteProjectResponse,
  MemberMutationResponse,
  Project,
  ProjectMember,
  ProjectSummary,
  ProjectWithRole,
  QueryProjectsParams,
  RemoveMemberResponse,
  RestoreProjectResponse,
  RoleDefinition,
  SyncDriveResponse,
  UpdateDriveFoldersPayload,
  UpdateDriveFoldersResponse,
  UpdateMemberRolePayload,
  UpdateProjectPayload,
} from '../types/api.types';

export const projectsService = {
  async listProjects(params?: QueryProjectsParams): Promise<ProjectWithRole[]> {
    const { data } = await apiClient.get<ProjectWithRole[]>('/projects', {
      params,
    });
    return data;
  },

  async createProject(payload: CreateProjectPayload): Promise<Project> {
    const { data } = await apiClient.post<Project>('/projects', payload);
    return data;
  },

  async getAvailableRoles(): Promise<RoleDefinition[]> {
    const { data } = await apiClient.get<RoleDefinition[]>('/projects/roles');
    return data;
  },

  async getProject(projectId: string): Promise<Project> {
    const { data } = await apiClient.get<Project>(
      `/projects/${encodeURIComponent(projectId)}`,
    );
    return data;
  },

  async getProjectSummary(projectId: string): Promise<ProjectSummary> {
    const { data } = await apiClient.get<ProjectSummary>(
      `/projects/${encodeURIComponent(projectId)}/summary`,
    );
    return data;
  },

  async updateProject(
    projectId: string,
    payload: UpdateProjectPayload,
  ): Promise<Project> {
    const { data } = await apiClient.patch<Project>(
      `/projects/${encodeURIComponent(projectId)}`,
      payload,
    );
    return data;
  },

  async updateDriveFolders(
    projectId: string,
    payload: UpdateDriveFoldersPayload,
  ): Promise<UpdateDriveFoldersResponse> {
    const { data } = await apiClient.patch<UpdateDriveFoldersResponse>(
      `/projects/${encodeURIComponent(projectId)}/drive`,
      payload,
    );
    return data;
  },

  async archiveProject(projectId: string): Promise<Project> {
    const { data } = await apiClient.patch<Project>(
      `/projects/${encodeURIComponent(projectId)}/archive`,
    );
    return data;
  },

  async restoreProject(projectId: string): Promise<RestoreProjectResponse> {
    const { data } = await apiClient.patch<RestoreProjectResponse>(
      `/projects/${encodeURIComponent(projectId)}/restore`,
    );
    return data;
  },

  async syncDrive(projectId: string): Promise<SyncDriveResponse> {
    const { data } = await apiClient.post<SyncDriveResponse>(
      `/projects/${encodeURIComponent(projectId)}/sync-drive`,
      undefined,
      { timeout: 120000 },
    );
    return data;
  },

  async deleteProject(
    projectId: string,
    permanent = false,
  ): Promise<DeleteProjectResponse> {
    const { data } = await apiClient.delete<DeleteProjectResponse>(
      `/projects/${encodeURIComponent(projectId)}`,
      {
        params: permanent ? { permanent: true } : undefined,
      },
    );
    return data;
  },

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    const { data } = await apiClient.get<ProjectMember[]>(
      `/projects/${encodeURIComponent(projectId)}/members`,
    );
    return data;
  },

  async getMember(projectId: string, userId: string): Promise<ProjectMember> {
    const { data } = await apiClient.get<ProjectMember>(
      `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    );
    return data;
  },

  async addMember(
    projectId: string,
    payload: AddMemberPayload,
  ): Promise<MemberMutationResponse> {
    const { data } = await apiClient.post<MemberMutationResponse>(
      `/projects/${encodeURIComponent(projectId)}/members`,
      payload,
    );
    return data;
  },

  async updateMemberRole(
    projectId: string,
    userId: string,
    payload: UpdateMemberRolePayload,
  ): Promise<MemberMutationResponse> {
    const { data } = await apiClient.patch<MemberMutationResponse>(
      `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      payload,
    );
    return data;
  },

  async removeMember(
    projectId: string,
    userId: string,
  ): Promise<RemoveMemberResponse> {
    const { data } = await apiClient.delete<RemoveMemberResponse>(
      `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    );
    return data;
  },
};

export default projectsService;

