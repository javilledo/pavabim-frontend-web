import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../api/client';
import { driveService } from '../../api/drive.service';
import { modelsService } from '../../api/models.service';
import { projectsService } from '../../api/projects.service';
import { settingsService } from '../../api/settings.service';
import { useAuth } from '../../auth/AuthProvider';
import { useProjectRole } from '../../hooks/useProjectRole';
import { useViewerStore } from '../../store/useViewerStore';
import type {
  AuthenticatedUser,
  Project,
  ProjectRole,
  ProjectWithRole,
  RoleDefinition,
} from '../../types/api.types';

export type AdminModalTab = 'projects' | 'superadmins';

interface ProjectManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_FALLBACKS: RoleDefinition[] = [
  { id: 'admin', name: 'Administrador', priority: 3 },
  { id: 'editor', name: 'Editor', priority: 2 },
  { id: 'viewer', name: 'Lector', priority: 1 },
];

const SPANISH_ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Lector',
};

function formatRoleLabel(roleId: string, dbName?: string): string {
  const normalized = roleId.trim().toLowerCase();
  const trimmedDbName = dbName?.trim();
  if (
    trimmedDbName &&
    trimmedDbName.toLowerCase() !== normalized &&
    trimmedDbName.toLowerCase() !== 'viewer' &&
    trimmedDbName.toLowerCase() !== 'admin' &&
    trimmedDbName.toLowerCase() !== 'editor'
  ) {
    return trimmedDbName;
  }
  return SPANISH_ROLE_LABELS[normalized] || trimmedDbName || roleId;
}

function getUserInitials(displayName?: string, email?: string): string {
  const source = (displayName || email || '').trim();
  if (!source) return 'U';
  const base = source.includes('@') ? source.split('@')[0] : source;
  const parts = base.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

function resolveUserIdentity(
  explicitName: string | undefined,
  explicitPhotoURL: string | undefined,
  emailOrId: string,
  currentUser: AuthenticatedUser | null,
): { displayName: string; photoURL?: string; hasDistinctName: boolean } {
  const normalizedTarget = emailOrId.trim().toLowerCase();
  const isCurrentUser = Boolean(
    currentUser?.email &&
      currentUser.email.trim().toLowerCase() === normalizedTarget,
  );

  const resolvedName =
    explicitName?.trim() ||
    (isCurrentUser ? currentUser?.displayName?.trim() : undefined) ||
    emailOrId;

  const resolvedPhoto =
    explicitPhotoURL?.trim() ||
    (isCurrentUser ? currentUser?.photoURL?.trim() : undefined) ||
    undefined;

  return {
    displayName: resolvedName,
    photoURL: resolvedPhoto,
    hasDistinctName: resolvedName.trim().toLowerCase() !== normalizedTarget,
  };
}

const AdminUserAvatar: React.FC<{
  photoURL?: string;
  displayName?: string;
  email: string;
}> = ({ photoURL, displayName, email }) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [photoURL]);

  if (photoURL && !imgFailed) {
    return (
      <img
        src={photoURL}
        alt={displayName || email}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className="w-7 h-7 rounded-full object-cover border border-pavasal-500/60 bg-asphalt-800 shrink-0"
      />
    );
  }

  return (
    <div className="w-7 h-7 rounded-full bg-pavasal-500/20 border border-pavasal-500/60 text-pavasal-400 text-[10px] font-bold flex items-center justify-center shrink-0">
      {getUserInitials(displayName, email)}
    </div>
  );
};

const GoogleDriveIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    className={className}
    viewBox="0 0 87.3 78"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
      fill="#0066da"
    />
    <path
      d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
      fill="#00ac47"
    />
    <path
      d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
      fill="#ea4335"
    />
    <path
      d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
      fill="#00832d"
    />
    <path
      d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
      fill="#2684fc"
    />
    <path
      d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
      fill="#ffba00"
    />
  </svg>
);

interface PendingMemberRemoval {
  project: ProjectWithRole;
  memberId: string;
  memberName: string;
  memberEmail: string;
}

type ConfirmActionState =
  | {
      kind: 'remove-member';
      projectId: string;
      projectName: string;
      memberId: string;
      memberName: string;
      memberEmail: string;
    }
  | {
      kind: 'delete-project';
      projectId: string;
      projectName: string;
    }
  | {
      kind: 'remove-superadmin';
      email: string;
      displayName: string;
    };

interface ProjectAdminCardProps {
  project: ProjectWithRole;
  isModalOpen: boolean;
  isSuperAdmin: boolean;
  currentUser: AuthenticatedUser | null;
  availableRoles: RoleDefinition[];
  rolesLoading: boolean;
  onFeedback: (message: string) => void;
  onError: (message: string) => void;
  onRequestEditProject: (project: ProjectWithRole) => void;
  onRequestDeleteProject: (project: ProjectWithRole) => void;
  onRequestRemoveMember: (payload: PendingMemberRemoval) => void;
}

const ProjectAdminCard: React.FC<ProjectAdminCardProps> = ({
  project,
  isModalOpen,
  isSuperAdmin,
  currentUser,
  availableRoles,
  rolesLoading,
  onFeedback,
  onError,
  onRequestEditProject,
  onRequestDeleteProject,
  onRequestRemoveMember,
}) => {
  const queryClient = useQueryClient();
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<ProjectRole>('editor');

  const summaryQuery = useQuery({
    queryKey: ['project-summary', project.id],
    queryFn: () => projectsService.getProjectSummary(project.id),
    enabled: isModalOpen,
    staleTime: 30_000,
  });

  const modelsQuery = useQuery({
    queryKey: ['models', project.id],
    queryFn: () => modelsService.listProjectModels(project.id),
    enabled: isModalOpen,
    retry: 0,
    staleTime: 30_000,
  });

  const membersQuery = useQuery({
    queryKey: ['project-members', project.id],
    queryFn: () => projectsService.listMembers(project.id),
    enabled: isModalOpen,
    staleTime: 15_000,
  });

  const roleOptions = availableRoles.length > 0 ? availableRoles : ROLE_FALLBACKS;

  useEffect(() => {
    if (roleOptions.length === 0) return;
    const exists = roleOptions.some((r) => r.id.toLowerCase() === newMemberRole);
    if (!exists) {
      setNewMemberRole((roleOptions[0].id.toLowerCase() as ProjectRole) || 'editor');
    }
  }, [newMemberRole, roleOptions]);

  const addMemberMutation = useMutation({
    mutationFn: () =>
      projectsService.addMember(project.id, {
        email: newMemberEmail.trim(),
        role: newMemberRole,
      }),
    onSuccess: () => {
      const addedEmail = newMemberEmail.trim();
      const roleOpt = roleOptions.find(
        (r) => r.id.toLowerCase() === newMemberRole.toLowerCase(),
      );
      const roleLabel = formatRoleLabel(newMemberRole, roleOpt?.name);
      onFeedback(
        `Miembro ${addedEmail} añadido a "${project.name}" como ${roleLabel}.`,
      );
      setNewMemberEmail('');
      setIsAddingMember(false);
      queryClient.invalidateQueries({ queryKey: ['project-members', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project-summary', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => onError(getApiErrorMessage(err)),
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: ({
      memberId,
      nextRole,
    }: {
      memberId: string;
      nextRole: ProjectRole;
    }) => projectsService.updateMemberRole(project.id, memberId, { role: nextRole }),
    onSuccess: (_res, vars) => {
      const roleOpt = roleOptions.find(
        (r) => r.id.toLowerCase() === vars.nextRole.toLowerCase(),
      );
      onFeedback(
        `Rol actualizado a ${formatRoleLabel(vars.nextRole, roleOpt?.name)} en "${project.name}".`,
      );
      queryClient.invalidateQueries({ queryKey: ['project-members', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => onError(getApiErrorMessage(err)),
  });

  const ifcModelsCount: number | string = modelsQuery.data
    ? modelsQuery.data.length
    : Array.isArray(project.models)
      ? project.models.length
      : summaryQuery.data?.stats.modelsReadyCount !== undefined
        ? summaryQuery.data.stats.modelsReadyCount
        : modelsQuery.isLoading || summaryQuery.isLoading
          ? '…'
          : 0;

  const topicsCount: number | string =
    summaryQuery.data?.stats.topics.total !== undefined
      ? summaryQuery.data.stats.topics.total
      : summaryQuery.isLoading
        ? '…'
        : 0;

  const members = membersQuery.data || [];

  return (
    <div className="rounded-lg border border-asphalt-700 bg-asphalt-950/70 p-4 space-y-3.5 shadow-sm">
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          <h3
            className="text-sm font-bold text-white truncate"
            title={project.name}
          >
            {project.name}
          </h3>
          {project.status && project.status !== 'active' && (
            <span className="rounded bg-pavasal-500/15 border border-pavasal-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-pavasal-400">
              {project.status}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onRequestEditProject(project)}
            className="p-1.5 rounded border border-asphalt-700 bg-asphalt-800 text-asphalt-300 hover:border-pavasal-500/60 hover:text-pavasal-400 transition-colors"
            title="Editar proyecto"
            aria-label={`Editar proyecto ${project.name}`}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L4.5 13.5 1.5 14.5l1-3 9-9z" />
            </svg>
          </button>

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => onRequestDeleteProject(project)}
              className="p-1.5 rounded border border-asphalt-700 bg-asphalt-800 text-red-400 hover:border-red-500/60 hover:bg-red-950/60 hover:text-red-300 transition-colors"
              title="Eliminar proyecto"
              aria-label={`Eliminar proyecto ${project.name}`}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Drive Folder IDs + Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="rounded border border-asphalt-800 bg-asphalt-900/80 px-2.5 py-2 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-asphalt-400">
            Carpeta IFC
          </div>
          <code
            className="block mt-0.5 text-[11px] font-mono text-asphalt-100 truncate select-text"
            title={project.drive?.sourceIfcFolderId || ''}
          >
            {project.drive?.sourceIfcFolderId || '—'}
          </code>
        </div>

        <div className="rounded border border-asphalt-800 bg-asphalt-900/80 px-2.5 py-2 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-asphalt-400">
            Carpeta de Trabajo
          </div>
          <code
            className="block mt-0.5 text-[11px] font-mono text-asphalt-100 truncate select-text"
            title={project.drive?.workspaceFolderId || ''}
          >
            {project.drive?.workspaceFolderId || '—'}
          </code>
        </div>

        <div className="rounded border border-asphalt-800 bg-asphalt-900/80 px-2.5 py-2 flex items-center justify-between sm:block">
          <div className="text-[10px] uppercase tracking-wider text-asphalt-400">
            Modelos IFC
          </div>
          <div className="text-sm font-bold text-pavasal-400 mt-0.5">
            {ifcModelsCount}
          </div>
        </div>

        <div className="rounded border border-asphalt-800 bg-asphalt-900/80 px-2.5 py-2 flex items-center justify-between sm:block">
          <div className="text-[10px] uppercase tracking-wider text-asphalt-400">
            Tópicos
          </div>
          <div className="text-sm font-bold text-pavasal-400 mt-0.5">
            {topicsCount}
          </div>
        </div>
      </div>

      {/* Members List */}
      <div className="pt-2.5 border-t border-asphalt-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-asphalt-300">
            Miembros ({membersQuery.isLoading ? '…' : members.length})
          </span>
          <button
            type="button"
            onClick={() => setIsAddingMember((prev) => !prev)}
            className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1 text-[11px] font-medium text-pavasal-400 hover:border-pavasal-500/60 hover:text-pavasal-300 transition-colors"
          >
            {isAddingMember ? 'Cancelar' : '+ Añadir miembro'}
          </button>
        </div>

        {isAddingMember && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newMemberEmail.trim()) return;
              addMemberMutation.mutate();
            }}
            className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded border border-asphalt-700 bg-asphalt-900 p-2"
          >
            <input
              type="email"
              required
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder="correo@pavasal.com"
              className="flex-1 min-w-[180px] rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1 text-xs text-white focus:border-pavasal-500 focus:outline-none"
            />
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value as ProjectRole)}
              disabled={rolesLoading && availableRoles.length === 0}
              className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1 text-xs text-white focus:border-pavasal-500 focus:outline-none disabled:opacity-50"
            >
              {roleOptions.map((roleOption) => {
                const roleId = roleOption.id.toLowerCase();
                return (
                  <option key={roleId} value={roleId}>
                    {formatRoleLabel(roleId, roleOption.name)}
                  </option>
                );
              })}
            </select>
            <button
              type="submit"
              disabled={addMemberMutation.isPending}
              className="rounded bg-pavasal-500 px-3 py-1 text-xs font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50"
            >
              {addMemberMutation.isPending ? 'Añadiendo...' : 'Añadir'}
            </button>
          </form>
        )}

        {membersQuery.isLoading ? (
          <p className="text-[11px] text-asphalt-400 py-1">
            Cargando miembros...
          </p>
        ) : membersQuery.isError ? (
          <p className="text-[11px] text-red-400 py-1">
            No se pudieron cargar los miembros de este proyecto.
          </p>
        ) : members.length === 0 ? (
          <p className="text-[11px] text-asphalt-400 py-1">
            No hay miembros asignados en este proyecto.
          </p>
        ) : (
          <div className="divide-y divide-asphalt-800 rounded border border-asphalt-800 bg-asphalt-900/60">
            {members.map((member) => {
              const memberId = member.id || member.email;
              const memberEmail = member.email || member.id;
              const {
                displayName: memberName,
                photoURL: memberPhotoURL,
                hasDistinctName,
              } = resolveUserIdentity(
                member.displayName || member.name,
                member.photoURL,
                memberEmail,
                currentUser,
              );
              const normalizedRoleId = String(member.roleId || 'viewer')
                .trim()
                .toLowerCase();

              return (
                <div
                  key={memberId}
                  className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <AdminUserAvatar
                      photoURL={memberPhotoURL}
                      displayName={hasDistinctName ? memberName : undefined}
                      email={memberEmail}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-asphalt-100 truncate select-text">
                        {memberName}
                      </div>
                      {hasDistinctName && (
                        <div className="text-[11px] text-asphalt-400 truncate select-text">
                          {memberEmail}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={normalizedRoleId}
                      disabled={updateMemberRoleMutation.isPending}
                      onChange={(e) =>
                        updateMemberRoleMutation.mutate({
                          memberId,
                          nextRole: e.target.value as ProjectRole,
                        })
                      }
                      aria-label={`Rol de ${memberEmail}`}
                      className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1 text-[11px] text-white focus:border-pavasal-500 focus:outline-none disabled:opacity-50"
                    >
                      {!roleOptions.some(
                        (r) => r.id.toLowerCase() === normalizedRoleId,
                      ) && (
                        <option value={normalizedRoleId}>
                          {formatRoleLabel(normalizedRoleId, member.roleName)}
                        </option>
                      )}
                      {roleOptions.map((roleOption) => {
                        const optId = roleOption.id.toLowerCase();
                        return (
                          <option key={optId} value={optId}>
                            {formatRoleLabel(optId, roleOption.name)}
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        onRequestRemoveMember({
                          project,
                          memberId,
                          memberName,
                          memberEmail,
                        })
                      }
                      className="p-1 rounded border border-asphalt-700 bg-asphalt-800 text-red-400 hover:border-red-500/60 hover:bg-red-950/60 hover:text-red-300 transition-colors"
                      title={`Eliminar a ${memberEmail} del proyecto`}
                      aria-label={`Eliminar miembro ${memberEmail}`}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const ProjectManagementModal: React.FC<ProjectManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {
    projects,
    currentProject,
    setProjects,
    setCurrentProject,
    setCurrentProjectById,
  } = useViewerStore();
  const { isSuperAdmin } = useProjectRole();

  const [tab, setTab] = useState<AdminModalTab>('projects');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create Project Sub-modal state (Superadmin only)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createClientName, setCreateClientName] = useState('');
  const [createLocation, setCreateLocation] = useState('');
  const [createIfcFolderId, setCreateIfcFolderId] = useState('');
  const [createWorkspaceFolderId, setCreateWorkspaceFolderId] = useState('');

  // Edit Project Sub-modal state
  const [editingProject, setEditingProject] = useState<ProjectWithRole | null>(
    null,
  );
  const [editName, setEditName] = useState('');
  const [editIfcFolderId, setEditIfcFolderId] = useState('');
  const [editWorkspaceFolderId, setEditWorkspaceFolderId] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Superadmin tab state
  const [newSuperAdminEmail, setNewSuperAdminEmail] = useState('');

  // Confirmation modal state
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen) {
      setIsCreateOpen(false);
      setEditingProject(null);
      setConfirmAction(null);
      return;
    }
    setFeedback(null);
    setErrorMsg(null);
    setTab('projects');
  }, [isOpen]);

  useEffect(() => {
    if (!isSuperAdmin && tab === 'superadmins') {
      setTab('projects');
    }
  }, [isSuperAdmin, tab]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmAction) {
        setConfirmAction(null);
        return;
      }
      if (editingProject) {
        setEditingProject(null);
        return;
      }
      if (isCreateOpen) {
        setIsCreateOpen(false);
        return;
      }
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmAction, editingProject, isCreateOpen, isOpen, onClose]);

  const projectsQuery = useQuery({
    queryKey: ['projects', user?.uid],
    queryFn: () => projectsService.listProjects(),
    enabled: isOpen && Boolean(user),
  });

  useEffect(() => {
    if (projectsQuery.data) {
      setProjects(projectsQuery.data);
    }
  }, [projectsQuery.data, setProjects]);

  const rolesQuery = useQuery({
    queryKey: ['project-roles'],
    queryFn: () => projectsService.getAvailableRoles(),
    enabled: isOpen,
    staleTime: 60_000,
  });

  const projectRoles = useMemo(() => {
    const raw = rolesQuery.data || [];
    const filtered = raw.filter(
      (r) => r.id.trim().toLowerCase() !== 'superadmin',
    );
    const list = filtered.length > 0 ? filtered : ROLE_FALLBACKS;
    return [...list].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  }, [rolesQuery.data]);

  const visibleProjects = useMemo(() => {
    if (isSuperAdmin) {
      return projects;
    }
    return projects.filter((proj) => proj.myRole === 'admin');
  }, [isSuperAdmin, projects]);

  const superAdminsQuery = useQuery({
    queryKey: ['app-superadmins'],
    queryFn: () => settingsService.listSuperAdmins(),
    enabled: isOpen && isSuperAdmin && tab === 'superadmins',
  });

  const driveConnectMutation = useMutation({
    mutationFn: () => driveService.openDriveOAuthPopup(),
    onSuccess: (res) => {
      setErrorMsg(null);
      setFeedback(
        res.email
          ? `Google Drive vinculado correctamente (${res.email}).`
          : 'Google Drive vinculado correctamente.',
      );
    },
    onError: (err) => {
      setFeedback(null);
      setErrorMsg(getApiErrorMessage(err));
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: () =>
      projectsService.createProject({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        clientName: createClientName.trim() || undefined,
        location: createLocation.trim() || undefined,
        sourceIfcFolderId: createIfcFolderId.trim(),
        workspaceFolderId: createWorkspaceFolderId.trim(),
      }),
    onSuccess: async (created) => {
      setErrorMsg(null);
      setFeedback(`Proyecto "${created.name}" creado correctamente.`);
      setCreateName('');
      setCreateDescription('');
      setCreateClientName('');
      setCreateLocation('');
      setCreateIfcFolderId('');
      setCreateWorkspaceFolderId('');
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await projectsQuery.refetch();
    },
    onError: (err) => {
      setFeedback(null);
      setErrorMsg(getApiErrorMessage(err));
    },
  });

  const editProjectMutation = useMutation({
    mutationFn: async () => {
      if (!editingProject) {
        throw new Error('No hay ningún proyecto seleccionado para editar.');
      }

      const trimmedName = editName.trim();
      const trimmedIfc = editIfcFolderId.trim();
      const trimmedWorkspace = editWorkspaceFolderId.trim();
      const trimmedClient = editClientName.trim();
      const trimmedLocation = editLocation.trim();
      const trimmedDescription = editDescription.trim();

      if (!trimmedIfc || !trimmedWorkspace) {
        throw new Error(
          'Los IDs de carpeta de IFC y carpeta de trabajo son obligatorios.',
        );
      }
      if (trimmedIfc === trimmedWorkspace) {
        throw new Error(
          'El ID de carpeta de IFC y el de carpeta de trabajo deben ser diferentes.',
        );
      }

      const metadataPatch: {
        name?: string;
        clientName?: string;
        location?: string;
        description?: string;
      } = {};

      if (isSuperAdmin && trimmedName && trimmedName !== editingProject.name) {
        metadataPatch.name = trimmedName;
      }
      if (trimmedClient !== (editingProject.clientName || '')) {
        metadataPatch.clientName = trimmedClient;
      }
      if (trimmedLocation !== (editingProject.location || '')) {
        metadataPatch.location = trimmedLocation;
      }
      if (trimmedDescription !== (editingProject.description || '')) {
        metadataPatch.description = trimmedDescription;
      }

      const currentIfc = editingProject.drive?.sourceIfcFolderId || '';
      const currentWorkspace = editingProject.drive?.workspaceFolderId || '';
      const drivePatch: {
        sourceIfcFolderId?: string;
        workspaceFolderId?: string;
      } = {};

      if (trimmedIfc !== currentIfc) {
        drivePatch.sourceIfcFolderId = trimmedIfc;
      }
      if (trimmedWorkspace !== currentWorkspace) {
        drivePatch.workspaceFolderId = trimmedWorkspace;
      }

      if (
        Object.keys(metadataPatch).length === 0 &&
        Object.keys(drivePatch).length === 0
      ) {
        return { project: editingProject, changed: false };
      }

      let updatedProject: Project = editingProject;
      if (Object.keys(metadataPatch).length > 0) {
        updatedProject = await projectsService.updateProject(
          editingProject.id,
          metadataPatch,
        );
      }
      if (Object.keys(drivePatch).length > 0) {
        const driveRes = await projectsService.updateDriveFolders(
          editingProject.id,
          drivePatch,
        );
        updatedProject = {
          ...updatedProject,
          drive: driveRes.drive,
        };
      }

      return { project: updatedProject, changed: true };
    },
    onSuccess: async (result) => {
      if (result.changed && editingProject) {
        if (currentProject?.id === editingProject.id) {
          setCurrentProject({
            ...currentProject,
            ...result.project,
            myRole: currentProject.myRole,
          });
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['projects'] }),
          queryClient.invalidateQueries({
            queryKey: ['project-summary', editingProject.id],
          }),
          queryClient.invalidateQueries({
            queryKey: ['models', editingProject.id],
          }),
        ]);
        await projectsQuery.refetch();
        setErrorMsg(null);
        setFeedback(`Proyecto "${result.project.name}" actualizado.`);
      }
      setEditingProject(null);
    },
    onError: (err) => {
      setFeedback(null);
      setErrorMsg(getApiErrorMessage(err));
    },
  });

  const addSuperAdminMutation = useMutation({
    mutationFn: (email: string) =>
      settingsService.assignSuperAdmin({ email: email.trim(), isSuperAdmin: true }),
    onSuccess: (_res, email) => {
      setErrorMsg(null);
      setFeedback(`Superadministrador ${email.trim()} añadido correctamente.`);
      setNewSuperAdminEmail('');
      queryClient.invalidateQueries({ queryKey: ['app-superadmins'] });
    },
    onError: (err) => {
      setFeedback(null);
      setErrorMsg(getApiErrorMessage(err));
    },
  });

  const confirmActionMutation = useMutation({
    mutationFn: async (action: ConfirmActionState) => {
      if (action.kind === 'remove-member') {
        await projectsService.removeMember(action.projectId, action.memberId);
        return action;
      }
      if (action.kind === 'delete-project') {
        await projectsService.deleteProject(action.projectId);
        return action;
      }
      await settingsService.assignSuperAdmin({
        email: action.email,
        isSuperAdmin: false,
      });
      return action;
    },
    onSuccess: async (action) => {
      setErrorMsg(null);
      if (action.kind === 'remove-member') {
        setFeedback(
          `Miembro ${action.memberEmail} eliminado de "${action.projectName}".`,
        );
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['project-members', action.projectId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['project-summary', action.projectId],
          }),
          queryClient.invalidateQueries({ queryKey: ['projects'] }),
        ]);
      } else if (action.kind === 'delete-project') {
        if (currentProject?.id === action.projectId) {
          setCurrentProjectById(null);
        }
        setFeedback(`Proyecto "${action.projectName}" eliminado.`);
        await queryClient.invalidateQueries({ queryKey: ['projects'] });
        await projectsQuery.refetch();
      } else {
        setFeedback(`Superadministrador ${action.email} eliminado.`);
        await queryClient.invalidateQueries({ queryKey: ['app-superadmins'] });
      }
      setConfirmAction(null);
    },
    onError: (err) => {
      setFeedback(null);
      setErrorMsg(getApiErrorMessage(err));
      setConfirmAction(null);
    },
  });

  const openCreateModal = () => {
    setErrorMsg(null);
    setCreateName('');
    setCreateDescription('');
    setCreateClientName('');
    setCreateLocation('');
    setCreateIfcFolderId('');
    setCreateWorkspaceFolderId('');
    setIsCreateOpen(true);
  };

  const openEditModal = (project: ProjectWithRole) => {
    setErrorMsg(null);
    setEditingProject(project);
    setEditName(project.name || '');
    setEditIfcFolderId(project.drive?.sourceIfcFolderId || '');
    setEditWorkspaceFolderId(project.drive?.workspaceFolderId || '');
    setEditClientName(project.clientName || '');
    setEditLocation(project.location || '');
    setEditDescription(project.description || '');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-lg border border-asphalt-700 border-t-2 border-t-pavasal-500 bg-asphalt-900 text-asphalt-100 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header (no project name shown) */}
        <div className="flex items-center justify-between gap-3 border-b border-asphalt-800 px-5 py-3.5">
          <h2 className="text-sm font-bold text-white">
            Panel de Administración
          </h2>

          <div className="flex items-center gap-2 shrink-0">
            {isSuperAdmin && (
              <>
                <button
                  type="button"
                  disabled={driveConnectMutation.isPending}
                  onClick={() => driveConnectMutation.mutate()}
                  className="p-1.5 rounded border border-asphalt-700 bg-asphalt-800 hover:border-pavasal-500/60 hover:bg-asphalt-700/70 transition-colors disabled:opacity-50"
                  title="Conectar con Google Drive"
                  aria-label="Conectar con Google Drive"
                >
                  <GoogleDriveIcon
                    className={`w-4 h-4 ${
                      driveConnectMutation.isPending ? 'animate-pulse' : ''
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={openCreateModal}
                  className="rounded bg-pavasal-500 px-3 py-1.5 text-xs font-bold text-asphalt-950 hover:bg-pavasal-400 transition-colors"
                >
                  + Nuevo proyecto
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-asphalt-400 hover:bg-asphalt-800 hover:text-white transition-colors"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-asphalt-800 px-5 pt-2 gap-2 text-xs bg-asphalt-950/60">
          <button
            type="button"
            onClick={() => setTab('projects')}
            className={`px-3 py-1.5 rounded-t border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === 'projects'
                ? 'border-pavasal-500 text-pavasal-400 font-semibold'
                : 'border-transparent text-asphalt-400 hover:text-white'
            }`}
          >
            <span>Proyectos</span>
            <span className="rounded-full bg-asphalt-800 px-1.5 py-0.5 text-[10px] font-mono text-asphalt-300">
              {visibleProjects.length}
            </span>
          </button>

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setTab('superadmins')}
              className={`px-3 py-1.5 rounded-t border-b-2 transition-colors ${
                tab === 'superadmins'
                  ? 'border-pavasal-500 text-pavasal-400 font-semibold'
                  : 'border-transparent text-asphalt-400 hover:text-white'
              }`}
            >
              Superadministradores
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {feedback && (
            <div className="rounded border border-emerald-700/70 bg-emerald-950/60 px-3 py-2 text-emerald-200 flex items-center justify-between gap-2">
              <span>{feedback}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-xs opacity-75 hover:opacity-100"
                aria-label="Ocultar aviso"
              >
                ✕
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="rounded border border-red-700/70 bg-red-950/60 px-3 py-2 text-red-200 flex items-center justify-between gap-2">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-xs opacity-75 hover:opacity-100"
                aria-label="Ocultar error"
              >
                ✕
              </button>
            </div>
          )}

          {tab === 'projects' && (
            <div className="space-y-4">
              {projectsQuery.isLoading && projects.length === 0 ? (
                <div className="rounded border border-asphalt-800 bg-asphalt-950/60 p-6 text-center text-asphalt-400">
                  Cargando proyectos...
                </div>
              ) : visibleProjects.length === 0 ? (
                <div className="rounded border border-asphalt-800 bg-asphalt-950/60 p-6 text-center text-asphalt-400">
                  {isSuperAdmin
                    ? 'No hay proyectos creados todavía. Pulsa "+ Nuevo proyecto" para crear uno.'
                    : 'No administras ningún proyecto actualmente.'}
                </div>
              ) : (
                visibleProjects.map((project) => (
                  <ProjectAdminCard
                    key={project.id}
                    project={project}
                    isModalOpen={isOpen && tab === 'projects'}
                    isSuperAdmin={isSuperAdmin}
                    currentUser={user}
                    availableRoles={projectRoles}
                    rolesLoading={rolesQuery.isLoading}
                    onFeedback={(msg) => {
                      setErrorMsg(null);
                      setFeedback(msg);
                    }}
                    onError={(msg) => {
                      setFeedback(null);
                      setErrorMsg(msg);
                    }}
                    onRequestEditProject={openEditModal}
                    onRequestDeleteProject={(proj) =>
                      setConfirmAction({
                        kind: 'delete-project',
                        projectId: proj.id,
                        projectName: proj.name,
                      })
                    }
                    onRequestRemoveMember={({
                      project: targetProject,
                      memberId,
                      memberName,
                      memberEmail,
                    }) =>
                      setConfirmAction({
                        kind: 'remove-member',
                        projectId: targetProject.id,
                        projectName: targetProject.name,
                        memberId,
                        memberName,
                        memberEmail,
                      })
                    }
                  />
                ))
              )}
            </div>
          )}

          {tab === 'superadmins' && isSuperAdmin && (
            <div className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newSuperAdminEmail.trim()) return;
                  addSuperAdminMutation.mutate(newSuperAdminEmail);
                }}
                className="flex flex-wrap sm:flex-nowrap gap-2"
              >
                <input
                  type="email"
                  required
                  value={newSuperAdminEmail}
                  onChange={(e) => setNewSuperAdminEmail(e.target.value)}
                  placeholder="Email de Google del usuario (ej. usuario@pavasal.com)"
                  className="flex-1 min-w-[220px] rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={addSuperAdminMutation.isPending}
                  className="rounded bg-pavasal-500 px-3.5 py-1.5 text-asphalt-950 font-bold hover:bg-pavasal-400 disabled:opacity-50"
                >
                  {addSuperAdminMutation.isPending ? 'Añadiendo...' : 'Añadir'}
                </button>
              </form>

              {superAdminsQuery.isLoading ? (
                <p className="text-asphalt-400">
                  Cargando superadministradores...
                </p>
              ) : (superAdminsQuery.data || []).length === 0 ? (
                <p className="text-asphalt-400">
                  No hay superadministradores registrados.
                </p>
              ) : (
                <div className="divide-y divide-asphalt-800 rounded border border-asphalt-700 bg-asphalt-950/60">
                  {(superAdminsQuery.data || []).map((sa) => {
                    const email = sa.email || sa.id;
                    const {
                      displayName,
                      photoURL,
                      hasDistinctName,
                    } = resolveUserIdentity(
                      sa.displayName || sa.name,
                      sa.photoURL,
                      email,
                      user,
                    );
                    return (
                      <div
                        key={sa.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AdminUserAvatar
                            photoURL={photoURL}
                            displayName={hasDistinctName ? displayName : undefined}
                            email={email}
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-asphalt-100 truncate select-text">
                              {displayName}
                            </div>
                            {hasDistinctName && (
                              <div className="text-[11px] text-asphalt-400 truncate select-text">
                                {email}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              kind: 'remove-superadmin',
                              email,
                              displayName,
                            })
                          }
                          className="p-1.5 rounded border border-asphalt-700 bg-asphalt-800 text-red-400 hover:border-red-500/60 hover:bg-red-950/60 hover:text-red-300 transition-colors shrink-0"
                          title={`Eliminar a ${email} de superadministradores`}
                          aria-label={`Eliminar superadministrador ${email}`}
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            aria-hidden="true"
                          >
                            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Project Sub-Modal (Superadmin only) */}
      {isCreateOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg border border-asphalt-700 border-t-2 border-t-pavasal-500 bg-asphalt-900 text-asphalt-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-asphalt-800 px-4 py-3">
              <h3 className="text-sm font-bold text-white">Nuevo proyecto</h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded p-1 text-asphalt-400 hover:bg-asphalt-800 hover:text-white"
                aria-label="Cerrar creación de proyecto"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProjectMutation.mutate();
              }}
              className="p-4 space-y-3 text-xs"
            >
              <div>
                <label className="block text-[11px] text-asphalt-200 mb-1">
                  Nombre del proyecto *
                </label>
                <input
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                  placeholder="Ej. Viaducto Sur BIM"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    ID Carpeta IFC (Google Drive) *
                  </label>
                  <input
                    required
                    value={createIfcFolderId}
                    onChange={(e) => setCreateIfcFolderId(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white font-mono focus:border-pavasal-500 focus:outline-none"
                    placeholder="1A2B3C..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    ID Carpeta de Trabajo (Google Drive) *
                  </label>
                  <input
                    required
                    value={createWorkspaceFolderId}
                    onChange={(e) => setCreateWorkspaceFolderId(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white font-mono focus:border-pavasal-500 focus:outline-none"
                    placeholder="9Z8Y7X..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    Cliente
                  </label>
                  <input
                    value={createClientName}
                    onChange={(e) => setCreateClientName(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    Ubicación
                  </label>
                  <input
                    value={createLocation}
                    onChange={(e) => setCreateLocation(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-asphalt-200 mb-1">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-asphalt-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createProjectMutation.isPending}
                  className="rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-asphalt-200 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createProjectMutation.isPending}
                  className="rounded bg-pavasal-500 px-4 py-1.5 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50"
                >
                  {createProjectMutation.isPending
                    ? 'Creando...'
                    : 'Crear proyecto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Project Sub-Modal */}
      {editingProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg border border-asphalt-700 border-t-2 border-t-pavasal-500 bg-asphalt-900 text-asphalt-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-asphalt-800 px-4 py-3">
              <h3 className="text-sm font-bold text-white">Editar proyecto</h3>
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="rounded p-1 text-asphalt-400 hover:bg-asphalt-800 hover:text-white"
                aria-label="Cerrar edición de proyecto"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                editProjectMutation.mutate();
              }}
              className="p-4 space-y-3 text-xs"
            >
              <div>
                <label className="block text-[11px] text-asphalt-200 mb-1">
                  Nombre del proyecto *
                </label>
                <input
                  required
                  value={editName}
                  disabled={!isSuperAdmin || editProjectMutation.isPending}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none disabled:opacity-60"
                />
                {!isSuperAdmin && (
                  <p className="text-[10px] text-asphalt-400 mt-1">
                    Solo un superadministrador puede modificar el nombre del proyecto.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    ID Carpeta IFC *
                  </label>
                  <input
                    required
                    value={editIfcFolderId}
                    disabled={editProjectMutation.isPending}
                    onChange={(e) => setEditIfcFolderId(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white font-mono focus:border-pavasal-500 focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    ID Carpeta de Trabajo *
                  </label>
                  <input
                    required
                    value={editWorkspaceFolderId}
                    disabled={editProjectMutation.isPending}
                    onChange={(e) => setEditWorkspaceFolderId(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white font-mono focus:border-pavasal-500 focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    Cliente
                  </label>
                  <input
                    value={editClientName}
                    disabled={editProjectMutation.isPending}
                    onChange={(e) => setEditClientName(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    Ubicación
                  </label>
                  <input
                    value={editLocation}
                    disabled={editProjectMutation.isPending}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-asphalt-200 mb-1">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  disabled={editProjectMutation.isPending}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none disabled:opacity-60"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-asphalt-800">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  disabled={editProjectMutation.isPending}
                  className="rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-asphalt-200 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editProjectMutation.isPending}
                  className="rounded bg-pavasal-500 px-4 py-1.5 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50"
                >
                  {editProjectMutation.isPending
                    ? 'Guardando...'
                    : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-asphalt-700 border-t-2 border-t-red-500 bg-asphalt-900 text-asphalt-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-asphalt-800 px-4 py-3">
              <h3 className="text-sm font-bold text-white">
                {confirmAction.kind === 'remove-member'
                  ? 'Confirmar eliminación de miembro'
                  : confirmAction.kind === 'delete-project'
                    ? 'Confirmar eliminación de proyecto'
                    : 'Confirmar eliminación de superadministrador'}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={confirmActionMutation.isPending}
                className="rounded p-1 text-asphalt-400 hover:bg-asphalt-800 hover:text-white"
                aria-label="Cerrar confirmación"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              {confirmAction.kind === 'remove-member' && (
                <p className="text-asphalt-200 leading-relaxed">
                  ¿Seguro que deseas eliminar a{' '}
                  <strong className="text-white">
                    {confirmAction.memberName}
                  </strong>{' '}
                  ({confirmAction.memberEmail}) del proyecto{' '}
                  <strong className="text-white">
                    {confirmAction.projectName}
                  </strong>
                  ?
                </p>
              )}

              {confirmAction.kind === 'delete-project' && (
                <p className="text-asphalt-200 leading-relaxed">
                  ¿Seguro que deseas eliminar el proyecto{' '}
                  <strong className="text-white">
                    {confirmAction.projectName}
                  </strong>
                  ? Los archivos originales de Google Drive no se eliminarán.
                </p>
              )}

              {confirmAction.kind === 'remove-superadmin' && (
                <p className="text-asphalt-200 leading-relaxed">
                  ¿Seguro que deseas quitar permisos de superadministrador a{' '}
                  <strong className="text-white">
                    {confirmAction.displayName}
                  </strong>{' '}
                  ({confirmAction.email})?
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-asphalt-800">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={confirmActionMutation.isPending}
                  className="rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-asphalt-200 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={confirmActionMutation.isPending}
                  onClick={() => confirmActionMutation.mutate(confirmAction)}
                  className="rounded bg-red-600 px-4 py-1.5 font-bold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {confirmActionMutation.isPending
                    ? 'Eliminando...'
                    : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectManagementModal;
