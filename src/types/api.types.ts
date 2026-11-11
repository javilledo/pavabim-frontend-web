export type ProjectRole = 'admin' | 'editor' | 'viewer';
export type EffectiveProjectRole = 'superadmin' | ProjectRole;
export type ProjectStatus = 'active' | 'archived' | 'completed' | 'deleted';

export interface DriveWorkspaceSubfolders {
  frag?: string;
  img?: string;
  bcf?: string;
  fragFolderId?: string;
  imgFolderId?: string;
  bcfFolderId?: string;
  [key: string]: string | undefined;
}

export interface ProjectDriveConfig {
  sourceIfcFolderId: string;
  workspaceFolderId: string;
  subfolders?: DriveWorkspaceSubfolders;
}

export interface ProjectMember {
  userId: string;
  email: string;
  roleId: ProjectRole | string;
  rolePath?: string;
  roleName?: string;
  addedAt?: unknown;
  updatedAt?: unknown;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  clientName?: string;
  location?: string;
  status: ProjectStatus;
  drive: ProjectDriveConfig;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
  updatedBy?: string;
  lastSyncedAt?: unknown;
  archivedAt?: unknown;
  deletedAt?: unknown;
  deletedBy?: string;
}

export interface ProjectWithRole extends Project {
  myRole: EffectiveProjectRole;
}

export interface ProjectSummary {
  project: {
    id: string;
    name: string;
    status: ProjectStatus;
    clientName?: string;
    location?: string;
  };
  stats: {
    membersCount: number;
    modelsReadyCount: number;
    topics: {
      total: number;
      open: number;
      inProgress: number;
      resolved: number;
      closed: number;
    };
  };
}

export interface RoleDefinition {
  id: string;
  name: string;
  description?: string;
  permissions?: string[];
  [key: string]: unknown;
}

export interface AuthenticatedUser {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  isSuperAdmin?: boolean;
  role?: string;
}

export interface AuthLoginPayload {
  email: string;
  password: string;
}

export interface AuthRefreshPayload {
  refreshToken: string;
}

export interface BackendAuthResponse {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number | string;
  user: AuthenticatedUser;
}

export interface AuthGoogleUrlResponse {
  url: string;
}

export interface AuthPopupMessageEventData {
  type: 'PAVABIM_AUTH_SUCCESS' | 'PAVABIM_AUTH_ERROR';
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number | string;
  user?: AuthenticatedUser;
  error?: string;
}

export interface QueryProjectsParams {
  search?: string;
  status?: ProjectStatus;
  limit?: number;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  clientName?: string;
  location?: string;
  sourceIfcFolderId: string;
  workspaceFolderId: string;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  clientName?: string;
  location?: string;
  status?: ProjectStatus;
}

export interface UpdateDriveFoldersPayload {
  sourceIfcFolderId?: string;
  workspaceFolderId?: string;
}

export interface UpdateDriveFoldersResponse {
  success: boolean;
  drive: ProjectDriveConfig;
}

export interface RestoreProjectResponse {
  success: boolean;
  id: string;
  status: ProjectStatus;
}

export interface DeleteProjectResponse {
  success: boolean;
  id: string;
  mode: 'soft-delete' | 'permanent-delete';
  note?: string;
}

export interface AddMemberPayload {
  email: string;
  role: ProjectRole;
}

export interface UpdateMemberRolePayload {
  role: ProjectRole;
}

export interface MemberMutationResponse {
  success: boolean;
  userId: string;
  email?: string;
  roleId: string;
}

export interface RemoveMemberResponse {
  success: boolean;
  removedUserId: string;
}

export type ModelConversionStatus =
  | 'READY'
  | 'PROCESSING'
  | 'NOT_CONVERTED'
  | 'FAILED';

export interface ModelStatusResponse {
  modelName: string;
  ifcFileId: string;
  status: ModelConversionStatus;
  fragFileId?: string;
  jsonFileId?: string;
  error?: string;
  updatedAt?: string;
}

export type ModelMetadata = ModelStatusResponse;

export interface ModelPropertiesDocument {
  modelName?: string;
  spatialStructure?: Record<string, unknown>;
  items?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface DriveAuthUrlResponse {
  url: string;
}

export interface DriveOAuthMessageEventData {
  type: 'GOOGLE_DRIVE_CONNECTED' | 'GOOGLE_DRIVE_ERROR';
  email?: string;
  error?: string;
}

export interface AppSettings {
  appName: string;
  companyName: string;
  supportEmail: string;
  defaultDriveRootFolderId?: string;
  allowedDomains: string[];
  autoConvertIfc: boolean;
  updatedAt?: unknown;
  updatedBy?: string;
}

export interface UpdateSettingsPayload {
  appName?: string;
  companyName?: string;
  supportEmail?: string;
  defaultDriveRootFolderId?: string;
  allowedDomains?: string[];
  autoConvertIfc?: boolean;
}

export interface SuperAdminEntry {
  id: string;
  email?: string;
  isSuperAdmin?: boolean;
  assignedBy?: string;
  updatedAt?: unknown;
}

export interface AssignSuperAdminPayload {
  email: string;
  isSuperAdmin: boolean;
}

export interface AssignSuperAdminResponse {
  success: boolean;
  email: string;
  userId: string;
  isSuperAdmin: boolean;
}

export interface SyncDriveResponse {
  success: boolean;
  ifcCount: number;
  ifcFiles: Array<{ id: string; name: string; size?: string | number }>;
  subfolders: DriveWorkspaceSubfolders;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp?: string;
  path?: string;
}
