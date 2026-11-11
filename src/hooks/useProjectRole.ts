import { useAuth } from '../auth/AuthProvider';
import { useViewerStore } from '../store/useViewerStore';
import type { EffectiveProjectRole } from '../types/api.types';

export type ResolvedRole = EffectiveProjectRole | 'guest';

export interface ProjectRolePermissions {
  role: ResolvedRole;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  canCreateProject: boolean;
  canManageProject: boolean;
  canManageMembers: boolean;
  canSyncDrive: boolean;
  canManageModels: boolean;
  canEditBcf: boolean;
  canEditBcfExtensions: boolean;
  isReadOnly: boolean;
}

export function useProjectRole(): ProjectRolePermissions {
  const { user } = useAuth();
  const projects = useViewerStore((state) => state.projects);
  const currentProject = useViewerStore((state) => state.currentProject);
  const hasSuperAdminProjectRole = projects.some(
    (project) => project.myRole === 'superadmin',
  );
  const isSuperAdmin =
    Boolean(user?.isSuperAdmin) ||
    currentProject?.myRole === 'superadmin' ||
    hasSuperAdminProjectRole;

  let role: ResolvedRole = 'guest';
  if (currentProject?.myRole) {
    role = currentProject.myRole;
  } else if (isSuperAdmin) {
    role = 'superadmin';
  } else if (user) {
    role = 'viewer';
  }

  const isAdmin = isSuperAdmin || role === 'admin';
  const isEditorOrHigher = isAdmin || role === 'editor';

  return {
    role,
    isSuperAdmin,
    isAdmin,
    canCreateProject: isSuperAdmin,
    canManageProject: isAdmin,
    canManageMembers: isAdmin,
    canSyncDrive: isEditorOrHigher,
    canManageModels: isEditorOrHigher,
    canEditBcf: isEditorOrHigher,
    canEditBcfExtensions: isAdmin,
    isReadOnly: !isEditorOrHigher,
  };
}
