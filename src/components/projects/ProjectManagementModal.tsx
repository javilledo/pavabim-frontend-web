import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../api/client';
import { driveService } from '../../api/drive.service';
import { projectsService } from '../../api/projects.service';
import { settingsService } from '../../api/settings.service';
import { useProjectRole } from '../../hooks/useProjectRole';
import { useViewerStore } from '../../store/useViewerStore';
import type { ProjectRole } from '../../types/api.types';

export type ProjectManagementTab = 'overview' | 'members' | 'create' | 'settings';

interface ProjectManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ProjectManagementTab;
}

export const ProjectManagementModal: React.FC<ProjectManagementModalProps> = ({
  isOpen,
  onClose,
  initialTab,
}) => {
  const queryClient = useQueryClient();
  const { currentProject, setCurrentProject } = useViewerStore();
  const {
    role,
    isSuperAdmin,
    canCreateProject,
    canManageProject,
    canManageMembers,
    canSyncDrive,
  } = useProjectRole();

  const [tab, setTab] = useState<ProjectManagementTab>(
    currentProject ? 'overview' : canCreateProject ? 'create' : 'overview',
  );

  useEffect(() => {
    if (!isOpen) return;
    const isRequestedTabAllowed =
      (initialTab === 'overview') ||
      (initialTab === 'members' && Boolean(currentProject)) ||
      (initialTab === 'create' && canCreateProject) ||
      (initialTab === 'settings' && isSuperAdmin);

    if (initialTab && isRequestedTabAllowed) {
      setTab(initialTab);
      return;
    }

    setTab(
      currentProject ? 'overview' : canCreateProject ? 'create' : 'overview',
    );
  }, [isOpen, initialTab, currentProject, canCreateProject, isSuperAdmin]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [sourceIfcFolderId, setSourceIfcFolderId] = useState('');
  const [workspaceFolderId, setWorkspaceFolderId] = useState('');

  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<ProjectRole>('editor');
  const [superAdminEmail, setSuperAdminEmail] = useState('');

  const projectId = currentProject?.id || '';

  const summaryQuery = useQuery({
    queryKey: ['project-summary', projectId],
    queryFn: () => projectsService.getProjectSummary(projectId),
    enabled: isOpen && Boolean(projectId) && tab === 'overview',
  });

  const membersQuery = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => projectsService.listMembers(projectId),
    enabled: isOpen && Boolean(projectId) && tab === 'members',
  });

  const rolesQuery = useQuery({
    queryKey: ['project-roles'],
    queryFn: () => projectsService.getAvailableRoles(),
    enabled: isOpen && tab === 'members',
  });

  const projectRoles = useMemo(() => {
    const raw = rolesQuery.data || [];
    const filtered = raw.filter(
      (r) => r.id.trim().toLowerCase() !== 'superadmin',
    );
    return [...filtered].sort(
      (a, b) => (a.priority ?? 999) - (b.priority ?? 999),
    );
  }, [rolesQuery.data]);

  const roleLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of projectRoles) {
      map.set(r.id.toLowerCase(), r.name || r.id);
    }
    return map;
  }, [projectRoles]);

  useEffect(() => {
    if (projectRoles.length === 0) return;
    const exists = projectRoles.some((r) => r.id === memberRole);
    if (!exists) {
      setMemberRole((projectRoles[0].id as ProjectRole) || 'editor');
    }
  }, [projectRoles, memberRole]);

  const settingsQuery = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => settingsService.getSettings(),
    enabled: isOpen && isSuperAdmin && tab === 'settings',
  });

  const superAdminsQuery = useQuery({
    queryKey: ['app-superadmins'],
    queryFn: () => settingsService.listSuperAdmins(),
    enabled: isOpen && isSuperAdmin && tab === 'settings',
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
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const syncDriveMutation = useMutation({
    mutationFn: () => projectsService.syncDrive(projectId),
    onSuccess: (res) => {
      setErrorMsg(null);
      setFeedback(
        `Sincronización completa: ${res.ifcCount} archivos IFC detectados.`,
      );
      queryClient.invalidateQueries({ queryKey: ['models', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-summary', projectId] });
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const createProjectMutation = useMutation({
    mutationFn: () =>
      projectsService.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        clientName: clientName.trim() || undefined,
        location: location.trim() || undefined,
        sourceIfcFolderId: sourceIfcFolderId.trim(),
        workspaceFolderId: workspaceFolderId.trim(),
      }),
    onSuccess: (created) => {
      setErrorMsg(null);
      setFeedback(`Proyecto "${created.name}" creado.`);
      setName('');
      setDescription('');
      setClientName('');
      setLocation('');
      setSourceIfcFolderId('');
      setWorkspaceFolderId('');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setCurrentProject({
        ...created,
        myRole: isSuperAdmin ? 'superadmin' : 'admin',
      });
      setTab('overview');
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const addMemberMutation = useMutation({
    mutationFn: () =>
      projectsService.addMember(projectId, {
        email: memberEmail.trim(),
        role: memberRole,
      }),
    onSuccess: () => {
      setErrorMsg(null);
      const roleLabel =
        roleLabelById.get(memberRole.toLowerCase()) || memberRole;
      setFeedback(`Miembro ${memberEmail} añadido como ${roleLabel}.`);
      setMemberEmail('');
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-summary', projectId] });
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: ({
      memberId,
      nextRole,
    }: {
      memberId: string;
      nextRole: ProjectRole;
    }) => projectsService.updateMemberRole(projectId, memberId, { role: nextRole }),
    onSuccess: () => {
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      projectsService.removeMember(projectId, memberId),
    onSuccess: () => {
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-summary', projectId] });
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const archiveToggleMutation = useMutation({
    mutationFn: async () => {
      if (!currentProject) return;
      if (currentProject.status === 'archived') {
        await projectsService.restoreProject(currentProject.id);
      } else {
        await projectsService.archiveProject(currentProject.id);
      }
    },
    onSuccess: () => {
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary', projectId] });
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const toggleAutoConvertMutation = useMutation({
    mutationFn: (nextVal: boolean) =>
      settingsService.updateSettings({ autoConvertIfc: nextVal }),
    onSuccess: () => {
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const assignSuperAdminMutation = useMutation({
    mutationFn: ({ email, isSuper }: { email: string; isSuper: boolean }) =>
      settingsService.assignSuperAdmin({ email, isSuperAdmin: isSuper }),
    onSuccess: () => {
      setErrorMsg(null);
      setSuperAdminEmail('');
      queryClient.invalidateQueries({ queryKey: ['app-superadmins'] });
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-lg border border-asphalt-700 border-t-2 border-t-pavasal-500 bg-asphalt-900 text-asphalt-100 shadow-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between border-b border-asphalt-800 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-white">
              Gestión de Proyecto e Integración Drive
            </h2>
            <p className="text-[11px] text-asphalt-400 mt-0.5">
              {currentProject
                ? `${currentProject.name} · Rol: ${role}`
                : 'Ningún proyecto activo seleccionado'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-asphalt-400 hover:bg-asphalt-800 hover:text-white"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-asphalt-800 px-5 pt-2 gap-2 text-xs bg-asphalt-950/60">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={`px-3 py-1.5 rounded-t border-b-2 transition-colors ${
              tab === 'overview'
                ? 'border-pavasal-500 text-pavasal-400 font-semibold'
                : 'border-transparent text-asphalt-400 hover:text-white'
            }`}
          >
            Resumen & Drive
          </button>
          <button
            type="button"
            disabled={!currentProject}
            onClick={() => setTab('members')}
            className={`px-3 py-1.5 rounded-t border-b-2 transition-colors disabled:opacity-40 ${
              tab === 'members'
                ? 'border-pavasal-500 text-pavasal-400 font-semibold'
                : 'border-transparent text-asphalt-400 hover:text-white'
            }`}
          >
            Miembros
          </button>
          {canCreateProject && (
            <button
              type="button"
              onClick={() => setTab('create')}
              className={`px-3 py-1.5 rounded-t border-b-2 transition-colors ${
                tab === 'create'
                  ? 'border-pavasal-500 text-pavasal-400 font-semibold'
                  : 'border-transparent text-asphalt-400 hover:text-white'
              }`}
            >
              + Nuevo Proyecto
            </button>
          )}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setTab('settings')}
              className={`px-3 py-1.5 rounded-t border-b-2 transition-colors ${
                tab === 'settings'
                  ? 'border-pavasal-500 text-pavasal-400 font-semibold'
                  : 'border-transparent text-asphalt-400 hover:text-white'
              }`}
            >
              Superadmin Config
            </button>
          )}
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {feedback && (
            <div className="rounded border border-emerald-700/70 bg-emerald-950/60 p-2.5 text-emerald-200">
              {feedback}
            </div>
          )}
          {errorMsg && (
            <div className="rounded border border-red-700/70 bg-red-950/60 p-2.5 text-red-200">
              {errorMsg}
            </div>
          )}

          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="rounded border border-asphalt-700 bg-asphalt-950/70 p-3.5 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">
                    Cuenta Google Drive OAuth2
                  </p>
                  <p className="text-[11px] text-asphalt-400 mt-0.5">
                    Vincula tu cuenta de Drive para escanear carpetas IFC y almacenar .frag / snapshots BCF.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={driveConnectMutation.isPending}
                  onClick={() => driveConnectMutation.mutate()}
                  className="shrink-0 rounded bg-pavasal-500 px-3 py-1.5 text-xs font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50"
                >
                  {driveConnectMutation.isPending
                    ? 'Abriendo...'
                    : 'Conectar Drive'}
                </button>
              </div>

              {currentProject ? (
                <>
                  <div className="rounded border border-asphalt-700 bg-asphalt-950/70 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">
                        {currentProject.name}
                      </span>
                      <span className="rounded bg-pavasal-500/15 border border-pavasal-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-pavasal-400">
                        {currentProject.status}
                      </span>
                    </div>
                    {currentProject.description && (
                      <p className="text-asphalt-300">
                        {currentProject.description}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-asphalt-800 text-[11px] text-asphalt-400">
                      <div>
                        Carpeta IFC:{' '}
                        <code className="text-asphalt-100">
                          {currentProject.drive?.sourceIfcFolderId}
                        </code>
                      </div>
                      <div>
                        Workspace:{' '}
                        <code className="text-asphalt-100">
                          {currentProject.drive?.workspaceFolderId}
                        </code>
                      </div>
                    </div>

                    {summaryQuery.data && (
                      <div className="grid grid-cols-3 gap-2 pt-3">
                        <div className="rounded bg-asphalt-900 p-2 border border-asphalt-700">
                          <div className="text-[10px] text-asphalt-400">
                            Miembros
                          </div>
                          <div className="text-sm font-bold text-pavasal-400">
                            {summaryQuery.data.stats.membersCount}
                          </div>
                        </div>
                        <div className="rounded bg-asphalt-900 p-2 border border-asphalt-700">
                          <div className="text-[10px] text-asphalt-400">
                            Modelos Listos
                          </div>
                          <div className="text-sm font-bold text-pavasal-400">
                            {summaryQuery.data.stats.modelsReadyCount}
                          </div>
                        </div>
                        <div className="rounded bg-asphalt-900 p-2 border border-asphalt-700">
                          <div className="text-[10px] text-asphalt-400">
                            Topics BCF
                          </div>
                          <div className="text-sm font-bold text-pavasal-400">
                            {summaryQuery.data.stats.topics.total} (
                            {summaryQuery.data.stats.topics.open} abiertos)
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canSyncDrive && (
                      <button
                        type="button"
                        disabled={syncDriveMutation.isPending}
                        onClick={() => syncDriveMutation.mutate()}
                        className="rounded bg-pavasal-500 px-3 py-1.5 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50"
                      >
                        {syncDriveMutation.isPending
                          ? 'Sincronizando Drive...'
                          : 'Sincronizar Drive (IFC & Workspace)'}
                      </button>
                    )}
                    {canManageProject && (
                      <button
                        type="button"
                        disabled={archiveToggleMutation.isPending}
                        onClick={() => archiveToggleMutation.mutate()}
                        className="rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-asphalt-100 hover:border-pavasal-500/60 hover:text-white"
                      >
                        {currentProject.status === 'archived'
                          ? 'Restaurar Proyecto'
                          : 'Archivar Proyecto'}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-asphalt-400">
                  Selecciona un proyecto en la barra superior o crea uno nuevo si eres Superadmin.
                </p>
              )}
            </div>
          )}

          {tab === 'members' && currentProject && (
            <div className="space-y-4">
              {canManageMembers && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!memberEmail.trim()) return;
                    addMemberMutation.mutate();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="email"
                    required
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="correo@pavasal.com"
                    className="flex-1 rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                  />
                  <select
                    value={memberRole}
                    onChange={(e) =>
                      setMemberRole(e.target.value as ProjectRole)
                    }
                    disabled={projectRoles.length === 0 && rolesQuery.isLoading}
                    className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1.5 text-white focus:border-pavasal-500 focus:outline-none disabled:opacity-50"
                  >
                    {projectRoles.length > 0 ? (
                      projectRoles.map((roleOption) => (
                        <option key={roleOption.id} value={roleOption.id}>
                          {roleOption.name || roleOption.id}
                        </option>
                      ))
                    ) : (
                      <option value={memberRole}>
                        {rolesQuery.isLoading ? 'Cargando roles...' : memberRole}
                      </option>
                    )}
                  </select>
                  <button
                    type="submit"
                    disabled={addMemberMutation.isPending}
                    className="rounded bg-pavasal-500 px-3 py-1.5 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50"
                  >
                    Añadir
                  </button>
                </form>
              )}

              {membersQuery.isLoading ? (
                <p className="text-asphalt-400">Cargando miembros...</p>
              ) : (
                <div className="divide-y divide-asphalt-800 rounded border border-asphalt-700">
                  {(membersQuery.data || []).map((member) => {
                    const memberId = member.id || member.email;
                    return (
                      <div
                        key={memberId}
                        className="flex items-center justify-between px-3 py-2 bg-asphalt-950/50"
                      >
                        <div>
                          <div className="font-medium text-asphalt-100">
                            {member.email}
                          </div>
                          <div className="text-[10px] text-asphalt-400">
                            {member.roleName ||
                              roleLabelById.get(
                                String(member.roleId || '').toLowerCase(),
                              ) ||
                              member.id}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canManageMembers ? (
                            <>
                              <select
                                value={member.roleId}
                                onChange={(e) =>
                                  updateMemberRoleMutation.mutate({
                                    memberId,
                                    nextRole: e.target.value as ProjectRole,
                                  })
                                }
                                className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1 text-[11px] text-white"
                              >
                                {projectRoles.length > 0 ? (
                                  <>
                                    {!projectRoles.some(
                                      (r) => r.id === member.roleId,
                                    ) && (
                                      <option value={member.roleId}>
                                        {member.roleName || member.roleId}
                                      </option>
                                    )}
                                    {projectRoles.map((roleOption) => (
                                      <option
                                        key={roleOption.id}
                                        value={roleOption.id}
                                      >
                                        {roleOption.name || roleOption.id}
                                      </option>
                                    ))}
                                  </>
                                ) : (
                                  <option value={member.roleId}>
                                    {member.roleName || member.roleId}
                                  </option>
                                )}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  removeMemberMutation.mutate(memberId)
                                }
                                className="text-red-400 hover:text-red-300 px-1.5 py-0.5 text-[11px]"
                              >
                                Quitar
                              </button>
                            </>
                          ) : (
                            <span className="rounded bg-asphalt-800 px-2 py-0.5 text-[11px] text-pavasal-400">
                              {member.roleName ||
                                roleLabelById.get(
                                  String(member.roleId || '').toLowerCase(),
                                ) ||
                                member.roleId}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'create' && canCreateProject && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProjectMutation.mutate();
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-[11px] text-asphalt-200 mb-1">
                  Nombre del proyecto *
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                  placeholder="Ej. Viaducto Sur BIM"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    Cliente
                  </label>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    Ubicación
                  </label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    ID Carpeta IFC (Google Drive) *
                  </label>
                  <input
                    required
                    value={sourceIfcFolderId}
                    onChange={(e) => setSourceIfcFolderId(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white font-mono focus:border-pavasal-500 focus:outline-none"
                    placeholder="1A2B3C..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-asphalt-200 mb-1">
                    ID Carpeta Workspace (Google Drive) *
                  </label>
                  <input
                    required
                    value={workspaceFolderId}
                    onChange={(e) => setWorkspaceFolderId(e.target.value)}
                    className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white font-mono focus:border-pavasal-500 focus:outline-none"
                    placeholder="9Z8Y7X..."
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-asphalt-200 mb-1">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={createProjectMutation.isPending}
                className="w-full rounded bg-pavasal-500 py-2 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50"
              >
                {createProjectMutation.isPending ? 'Creando...' : 'Crear Proyecto'}
              </button>
            </form>
          )}

          {tab === 'settings' && isSuperAdmin && (
            <div className="space-y-4">
              {settingsQuery.data && (
                <div className="rounded border border-asphalt-700 bg-asphalt-950/70 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">
                      {settingsQuery.data.appName} (
                      {settingsQuery.data.companyName})
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settingsQuery.data.autoConvertIfc}
                        onChange={(e) =>
                          toggleAutoConvertMutation.mutate(e.target.checked)
                        }
                        className="accent-pavasal-500"
                      />
                      <span>Auto-convertir IFC</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-asphalt-400">
                    Soporte: {settingsQuery.data.supportEmail}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="font-semibold text-pavasal-400">
                  Superadministradores
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!superAdminEmail.trim()) return;
                    assignSuperAdminMutation.mutate({
                      email: superAdminEmail.trim(),
                      isSuper: true,
                    });
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="email"
                    required
                    value={superAdminEmail}
                    onChange={(e) => setSuperAdminEmail(e.target.value)}
                    placeholder="nuevo-superadmin@pavasal.com"
                    className="flex-1 rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={assignSuperAdminMutation.isPending}
                    className="rounded bg-pavasal-500 px-3 py-1.5 text-asphalt-950 font-bold hover:bg-pavasal-400"
                  >
                    Promover
                  </button>
                </form>

                <div className="divide-y divide-asphalt-800 rounded border border-asphalt-700">
                  {(superAdminsQuery.data || []).map((sa) => (
                    <div
                      key={sa.id}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <span>{sa.email || sa.id}</span>
                      {sa.email && (
                        <button
                          type="button"
                          onClick={() =>
                            assignSuperAdminMutation.mutate({
                              email: sa.email!,
                              isSuper: false,
                            })
                          }
                          className="text-red-400 hover:text-red-300 text-[11px]"
                        >
                          Revocar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectManagementModal;
