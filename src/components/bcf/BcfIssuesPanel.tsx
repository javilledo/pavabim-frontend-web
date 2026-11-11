import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bcfService } from '../../api/bcf.service';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { useProjectRole } from '../../hooks/useProjectRole';
import { useViewerStore } from '../../store/useViewerStore';
import type {
  BcfPerspectiveCamera,
  BcfTopic,
  BcfViewpoint,
  CameraViewpointData,
  CreateViewpointPayload,
} from '../../types/bcf.types';
import { useEngine } from '../../viewer/EngineContext';
import { AuthenticatedImage } from '../common/AuthenticatedImage';

const DEFAULT_TOPIC_TYPES = ['Error', 'Warning', 'Info', 'Request'];
const DEFAULT_TOPIC_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const DEFAULT_PRIORITIES = ['Low', 'Normal', 'High', 'Critical'];

function toBcfPerspectiveCamera(cam: CameraViewpointData): BcfPerspectiveCamera {
  const dx = cam.target[0] - cam.position[0];
  const dy = cam.target[1] - cam.position[1];
  const dz = cam.target[2] - cam.position[2];
  const len = Math.hypot(dx, dy, dz) || 1;

  return {
    camera_view_point: {
      x: cam.position[0],
      y: cam.position[1],
      z: cam.position[2],
    },
    camera_direction: {
      x: dx / len,
      y: dy / len,
      z: dz / len,
    },
    camera_up_vector: {
      x: cam.up[0],
      y: cam.up[1],
      z: cam.up[2],
    },
    field_of_view: 60,
  };
}

function fromBcfViewpointToCameraData(
  vp: BcfViewpoint,
): CameraViewpointData | null {
  const cam = vp.perspective_camera || vp.orthogonal_camera;
  if (cam) {
    const pos = cam.camera_view_point;
    const dir = cam.camera_direction;
    const up = cam.camera_up_vector;
    const scale = 10;
    return {
      position: [pos.x, pos.y, pos.z],
      target: [
        pos.x + dir.x * scale,
        pos.y + dir.y * scale,
        pos.z + dir.z * scale,
      ],
      up: [up.x, up.y, up.z],
    };
  }

  if (vp.camera) {
    return {
      position: [
        vp.camera.position.x,
        vp.camera.position.y,
        vp.camera.position.z,
      ],
      target: [vp.camera.target.x, vp.camera.target.y, vp.camera.target.z],
      up: vp.camera.up
        ? [vp.camera.up.x, vp.camera.up.y, vp.camera.up.z]
        : [0, 1, 0],
    };
  }

  return null;
}

function extractSelectedIfcGuid(
  props: Record<string, unknown> | null,
): string | undefined {
  if (!props) return undefined;
  const raw = props._guid ?? props.GlobalId;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    const inner = (raw as { value?: unknown }).value;
    if (typeof inner === 'string' && inner.trim()) return inner.trim();
  }
  return undefined;
}

function formatDateShort(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo convertir el snapshot a imagen.'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export const BcfIssuesPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { canEditBcf } = useProjectRole();
  const {
    currentProject,
    activeBcfTopicId,
    setActiveBcfTopicId,
    selectedElementId,
    selectedElementProperties,
    localViewpoints,
    addLocalViewpoint,
    removeLocalViewpoint,
  } = useViewerStore();
  const {
    isEngineReady,
    getCameraViewpoint,
    setCameraViewpoint,
    captureSnapshotBlob,
  } = useEngine();

  const projectId = currentProject?.id || '';
  const isRemoteReady = Boolean(user && projectId);

  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [localViewTitle, setLocalViewTitle] = useState('');
  const [capturingLocal, setCapturingLocal] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('Error');
  const [newStatus, setNewStatus] = useState('Open');
  const [newPriority, setNewPriority] = useState('Normal');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [captureInitialViewpoint, setCaptureInitialViewpoint] = useState(true);

  const [commentText, setCommentText] = useState('');

  const extensionsQuery = useQuery({
    queryKey: ['bcf-extensions', projectId],
    queryFn: () => bcfService.getExtensions(projectId),
    enabled: isRemoteReady,
  });

  const statsQuery = useQuery({
    queryKey: ['bcf-stats', projectId],
    queryFn: () => bcfService.getTopicStats(projectId),
    enabled: isRemoteReady,
  });

  const topicsQuery = useQuery({
    queryKey: ['bcf-topics', projectId, searchTerm, statusFilter],
    queryFn: () =>
      bcfService.getTopics(projectId, {
        search: searchTerm.trim() || undefined,
        topic_status: statusFilter || undefined,
        sort_by: 'creation_date',
        sort_order: 'desc',
      }),
    enabled: isRemoteReady,
  });

  const activeTopicQuery = useQuery({
    queryKey: ['bcf-topic', projectId, activeBcfTopicId],
    queryFn: () => bcfService.getTopicById(projectId, activeBcfTopicId!, true),
    enabled: isRemoteReady && Boolean(activeBcfTopicId),
  });

  const topicTypes = useMemo(
    () =>
      extensionsQuery.data?.topic_type?.length
        ? extensionsQuery.data.topic_type
        : DEFAULT_TOPIC_TYPES,
    [extensionsQuery.data],
  );
  const topicStatuses = useMemo(
    () =>
      extensionsQuery.data?.topic_status?.length
        ? extensionsQuery.data.topic_status
        : DEFAULT_TOPIC_STATUSES,
    [extensionsQuery.data],
  );
  const priorities = useMemo(
    () =>
      extensionsQuery.data?.priority?.length
        ? extensionsQuery.data.priority
        : DEFAULT_PRIORITIES,
    [extensionsQuery.data],
  );

  const buildCurrentViewpointPayload =
    async (): Promise<CreateViewpointPayload | null> => {
      const cam = getCameraViewpoint();
      if (!cam) return null;

      const snapshotBlob = await captureSnapshotBlob();
      const selectedGuid = extractSelectedIfcGuid(selectedElementProperties);

      return {
        perspective_camera: toBcfPerspectiveCamera(cam),
        components:
          selectedElementId || selectedGuid
            ? {
                selection: [
                  {
                    ...(selectedGuid ? { ifc_guid: selectedGuid } : {}),
                    ...(selectedElementId
                      ? { authoring_tool_id: selectedElementId }
                      : {}),
                  },
                ],
              }
            : undefined,
        ...(snapshotBlob ? { snapshotFile: snapshotBlob } : {}),
      };
    };

  const invalidateBcfQueries = (topicId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['bcf-topics', projectId] });
    queryClient.invalidateQueries({ queryKey: ['bcf-stats', projectId] });
    if (topicId) {
      queryClient.invalidateQueries({
        queryKey: ['bcf-topic', projectId, topicId],
      });
    }
  };

  const createTopicMutation = useMutation({
    mutationFn: async () => {
      const created = await bcfService.createTopic(projectId, {
        title: newTitle.trim(),
        topic_type: newType,
        topic_status: newStatus,
        priority: newPriority,
        assigned_to: newAssignedTo.trim() || undefined,
        description: newDescription.trim() || undefined,
      });

      if (captureInitialViewpoint && isEngineReady) {
        const vpPayload = await buildCurrentViewpointPayload();
        if (vpPayload) {
          await bcfService.createViewpoint(projectId, created.guid, vpPayload);
        }
      }

      return created;
    },
    onSuccess: (created) => {
      setErrorMsg(null);
      setIsCreating(false);
      setNewTitle('');
      setNewAssignedTo('');
      setNewDescription('');
      invalidateBcfQueries(created.guid);
      setActiveBcfTopicId(created.guid);
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const addViewpointMutation = useMutation({
    mutationFn: async (topicId: string) => {
      const vpPayload = await buildCurrentViewpointPayload();
      if (!vpPayload) {
        throw new Error(
          'La cámara 3D no está lista para capturar un viewpoint.',
        );
      }
      return bcfService.createViewpoint(projectId, topicId, vpPayload);
    },
    onSuccess: (_, topicId) => {
      setErrorMsg(null);
      invalidateBcfQueries(topicId);
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const deleteViewpointMutation = useMutation({
    mutationFn: ({
      topicId,
      viewpointId,
    }: {
      topicId: string;
      viewpointId: string;
    }) => bcfService.deleteViewpoint(projectId, topicId, viewpointId),
    onSuccess: (_, vars) => {
      setErrorMsg(null);
      invalidateBcfQueries(vars.topicId);
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ topicId, status }: { topicId: string; status: string }) =>
      bcfService.updateTopicStatus(projectId, topicId, { topic_status: status }),
    onSuccess: (_, vars) => {
      setErrorMsg(null);
      invalidateBcfQueries(vars.topicId);
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const deleteTopicMutation = useMutation({
    mutationFn: (topicId: string) => bcfService.deleteTopic(projectId, topicId),
    onSuccess: () => {
      setErrorMsg(null);
      setActiveBcfTopicId(null);
      invalidateBcfQueries();
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const addCommentMutation = useMutation({
    mutationFn: ({
      topicId,
      comment,
    }: {
      topicId: string;
      comment: string;
    }) => bcfService.createComment(projectId, topicId, { comment }),
    onSuccess: (_, vars) => {
      setErrorMsg(null);
      setCommentText('');
      invalidateBcfQueries(vars.topicId);
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: ({
      topicId,
      commentId,
    }: {
      topicId: string;
      commentId: string;
    }) => bcfService.deleteComment(projectId, topicId, commentId),
    onSuccess: (_, vars) => {
      setErrorMsg(null);
      invalidateBcfQueries(vars.topicId);
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const handleExportMarkup = async (topic: BcfTopic) => {
    try {
      const xml = await bcfService.exportTopicMarkupXml(projectId, topic.guid);
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${topic.server_assigned_id || topic.guid}-markup.bcf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err));
    }
  };

  const handleCaptureLocalViewpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEngineReady) return;
    const cam = getCameraViewpoint();
    if (!cam) return;

    setCapturingLocal(true);
    try {
      const blob = await captureSnapshotBlob();
      const snapshotDataUrl = blob ? await blobToDataUrl(blob) : undefined;
      addLocalViewpoint({
        id: `local-vp-${Date.now()}`,
        title:
          localViewTitle.trim() || `Vista #${localViewpoints.length + 1}`,
        createdAt: new Date().toLocaleTimeString(),
        camera: cam,
        snapshotDataUrl,
      });
      setLocalViewTitle('');
    } finally {
      setCapturingLocal(false);
    }
  };

  // Standalone / No Project Mode: Local Viewpoints & Snapshots without server project
  if (!isRemoteReady) {
    return (
      <div className="space-y-4 text-xs">
        <div className="rounded border border-asphalt-700 bg-asphalt-950/70 p-3 space-y-1">
          <p className="font-semibold text-pavasal-400">
            Vistas y Capturas Locales
          </p>
          <p className="text-[11px] text-asphalt-300 leading-relaxed">
            Sin proyecto activo puedes guardar puntos de vista 3D y descargar
            capturas PNG de tus archivos <code className="text-pavasal-400">.frag</code> o{' '}
            <code className="text-pavasal-400">.ifc</code>. Para sincronizar
            incidencias BCF 3.0 en equipo, selecciona un proyecto.
          </p>
        </div>

        <form onSubmit={handleCaptureLocalViewpoint} className="space-y-2">
          <input
            value={localViewTitle}
            onChange={(e) => setLocalViewTitle(e.target.value)}
            placeholder="Nombre de la vista (opcional)"
            className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1.5 text-white placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!isEngineReady || capturingLocal}
            className="w-full rounded bg-pavasal-500 py-1.5 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 transition-colors"
          >
            {capturingLocal ? 'Capturando...' : '+ Capturar vista 3D local'}
          </button>
        </form>

        {localViewpoints.length === 0 ? (
          <p className="rounded border border-dashed border-asphalt-700 p-4 text-center text-asphalt-400 text-[11px]">
            Aún no hay vistas locales guardadas en esta sesión.
          </p>
        ) : (
          <div className="space-y-2">
            {localViewpoints.map((vp) => (
              <div
                key={vp.id}
                className="rounded border border-asphalt-700 bg-asphalt-800/70 overflow-hidden"
              >
                {vp.snapshotDataUrl && (
                  <button
                    type="button"
                    onClick={() => setCameraViewpoint(vp.camera)}
                    className="block w-full"
                    title="Restaurar cámara en escena 3D"
                  >
                    <img
                      src={vp.snapshotDataUrl}
                      alt={vp.title}
                      className="w-full h-28 object-cover"
                    />
                  </button>
                )}
                <div className="p-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setCameraViewpoint(vp.camera)}
                    className="text-left min-w-0 flex-1"
                  >
                    <div className="font-medium text-asphalt-100 truncate hover:text-pavasal-400">
                      {vp.title}
                    </div>
                    <div className="text-[10px] text-asphalt-400">
                      {vp.createdAt}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {vp.snapshotDataUrl && (
                      <a
                        href={vp.snapshotDataUrl}
                        download={`${vp.title.replace(/\s+/g, '_')}.png`}
                        className="text-[11px] text-pavasal-400 hover:text-pavasal-300"
                        title="Descargar captura PNG"
                      >
                        PNG
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeLocalViewpoint(vp.id)}
                      className="text-[11px] text-red-400 hover:text-red-300"
                      title="Eliminar vista"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isCreating) {
    return (
      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between border-b border-asphalt-700 pb-2">
          <h3 className="font-semibold text-pavasal-400">Nuevo Topic BCF 3.0</h3>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="text-asphalt-400 hover:text-white"
          >
            Cancelar
          </button>
        </div>

        {errorMsg && (
          <div className="rounded border border-red-700/70 bg-red-950/60 p-2 text-[11px] text-red-200">
            {errorMsg}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTitle.trim()) return;
            createTopicMutation.mutate();
          }}
          className="space-y-2.5"
        >
          <div>
            <label className="block text-[11px] text-asphalt-200 mb-1">
              Título *
            </label>
            <input
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ej. Colisión conducto HVAC con viga"
              className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1.5 text-white placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-asphalt-200 mb-1">
                Tipo
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
              >
                {topicTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-asphalt-200 mb-1">
                Estado
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
              >
                {topicStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-asphalt-200 mb-1">
                Prioridad
              </label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-asphalt-200 mb-1">
                Asignado a (email)
              </label>
              <input
                value={newAssignedTo}
                onChange={(e) => setNewAssignedTo(e.target.value)}
                placeholder="bim@pavasal.com"
                className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1.5 text-white placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-asphalt-200 mb-1">
              Descripción
            </label>
            <textarea
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1.5 text-white focus:border-pavasal-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-[11px] text-asphalt-200 cursor-pointer">
            <input
              type="checkbox"
              checked={captureInitialViewpoint}
              disabled={!isEngineReady}
              onChange={(e) => setCaptureInitialViewpoint(e.target.checked)}
              className="accent-pavasal-500"
            />
            <span>Capturar cámara 3D y snapshot PNG actual</span>
          </label>

          <button
            type="submit"
            disabled={createTopicMutation.isPending}
            className="w-full rounded bg-pavasal-500 py-2 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50 transition-colors"
          >
            {createTopicMutation.isPending ? 'Guardando...' : 'Crear Topic BCF'}
          </button>
        </form>
      </div>
    );
  }

  if (activeBcfTopicId) {
    const topic = activeTopicQuery.data;

    return (
      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between border-b border-asphalt-700 pb-2">
          <button
            type="button"
            onClick={() => setActiveBcfTopicId(null)}
            className="text-pavasal-400 hover:text-pavasal-300 font-semibold"
          >
            ← Volver a Topics
          </button>
          {topic && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleExportMarkup(topic)}
                className="text-[11px] text-asphalt-300 hover:text-pavasal-400"
                title="Exportar markup.bcf XML"
              >
                XML
              </button>
              {canEditBcf && (
                <button
                  type="button"
                  disabled={deleteTopicMutation.isPending}
                  onClick={() => deleteTopicMutation.mutate(topic.guid)}
                  className="text-[11px] text-red-400 hover:text-red-300"
                >
                  Eliminar
                </button>
              )}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="rounded border border-red-700/70 bg-red-950/60 p-2 text-[11px] text-red-200">
            {errorMsg}
          </div>
        )}

        {activeTopicQuery.isLoading || !topic ? (
          <p className="text-asphalt-400 py-4 text-center">Cargando detalle...</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded border border-asphalt-700 border-l-2 border-l-pavasal-500 bg-asphalt-800/70 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {topic.server_assigned_id && (
                    <span className="text-[10px] font-mono font-semibold text-pavasal-400 block">
                      {topic.server_assigned_id}
                    </span>
                  )}
                  <h4 className="font-semibold text-white text-sm leading-snug">
                    {topic.title}
                  </h4>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded bg-asphalt-950 border border-asphalt-700 px-1.5 py-0.5 text-asphalt-200">
                  {topic.topic_type}
                </span>
                {topic.priority && (
                  <span className="rounded bg-pavasal-950/80 border border-pavasal-700/70 px-1.5 py-0.5 text-pavasal-400 font-semibold">
                    {topic.priority}
                  </span>
                )}
                {topic.creation_author && (
                  <span className="text-asphalt-400 truncate">
                    por {topic.creation_author}
                  </span>
                )}
              </div>

              {topic.description && (
                <p className="text-asphalt-200 leading-relaxed pt-1">
                  {topic.description}
                </p>
              )}

              <div className="pt-2 border-t border-asphalt-700 flex items-center justify-between gap-2">
                <span className="text-[11px] text-asphalt-400">Estado:</span>
                {canEditBcf ? (
                  <select
                    value={topic.topic_status}
                    disabled={updateStatusMutation.isPending}
                    onChange={(e) =>
                      updateStatusMutation.mutate({
                        topicId: topic.guid,
                        status: e.target.value,
                      })
                    }
                    className="rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1 text-[11px] text-white focus:border-pavasal-500 focus:outline-none"
                  >
                    {topicStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded bg-asphalt-950 px-2 py-0.5 text-[11px] text-asphalt-200">
                    {topic.topic_status}
                  </span>
                )}
              </div>
            </div>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
                  Viewpoints ({topic.viewpoints?.length || 0})
                </h5>
                {canEditBcf && isEngineReady && (
                  <button
                    type="button"
                    disabled={addViewpointMutation.isPending}
                    onClick={() => addViewpointMutation.mutate(topic.guid)}
                    className="rounded bg-pavasal-500 px-2 py-0.5 text-[11px] font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50"
                  >
                    {addViewpointMutation.isPending
                      ? 'Capturando...'
                      : '+ Capturar Vista'}
                  </button>
                )}
              </div>

              {(topic.viewpoints || []).length === 0 ? (
                <p className="text-[11px] text-asphalt-400">
                  Sin viewpoints guardados.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {(topic.viewpoints || []).map((vp, idx) => {
                    const imgPath = bcfService.resolveViewpointSnapshotPath(
                      projectId,
                      topic.guid,
                      vp,
                    );
                    const camData = fromBcfViewpointToCameraData(vp);

                    return (
                      <div
                        key={vp.guid}
                        className="group relative rounded border border-asphalt-700 bg-asphalt-950 overflow-hidden hover:border-pavasal-500/70 transition-colors"
                      >
                        <button
                          type="button"
                          disabled={!camData || !isEngineReady}
                          onClick={() => camData && setCameraViewpoint(camData)}
                          className="w-full text-left disabled:opacity-60"
                          title="Ir a esta vista en el modelo 3D"
                        >
                          <AuthenticatedImage
                            src={imgPath}
                            alt={`Viewpoint ${idx + 1}`}
                            className="w-full h-24 object-cover"
                          />
                          <div className="px-2 py-1 flex items-center justify-between text-[10px] text-asphalt-200 bg-asphalt-900">
                            <span>Vista #{idx + 1}</span>
                            {camData && (
                              <span className="text-pavasal-400 font-semibold">
                                Aplicar
                              </span>
                            )}
                          </div>
                        </button>
                        {canEditBcf && (
                          <button
                            type="button"
                            onClick={() =>
                              deleteViewpointMutation.mutate({
                                topicId: topic.guid,
                                viewpointId: vp.guid,
                              })
                            }
                            className="absolute top-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Eliminar viewpoint"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-2 pt-2 border-t border-asphalt-700">
              <h5 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
                Comentarios ({topic.comments?.length || 0})
              </h5>

              <div className="space-y-2">
                {(topic.comments || []).map((c) => (
                  <div
                    key={c.guid}
                    className="rounded border border-asphalt-700 bg-asphalt-800/60 p-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] text-asphalt-400">
                      <span className="truncate font-medium text-pavasal-300">
                        {c.author}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span>{formatDateShort(c.date)}</span>
                        {canEditBcf && (
                          <button
                            type="button"
                            onClick={() =>
                              deleteCommentMutation.mutate({
                                topicId: topic.guid,
                                commentId: c.guid,
                              })
                            }
                            className="text-red-400 hover:text-red-300"
                            title="Eliminar comentario"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-asphalt-100 whitespace-pre-wrap">
                      {c.comment}
                    </p>
                  </div>
                ))}
              </div>

              {canEditBcf && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!commentText.trim()) return;
                    addCommentMutation.mutate({
                      topicId: topic.guid,
                      comment: commentText.trim(),
                    });
                  }}
                  className="flex gap-1.5 pt-1"
                >
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Añadir comentario..."
                    className="flex-1 rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1.5 text-white placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={
                      addCommentMutation.isPending || !commentText.trim()
                    }
                    className="rounded bg-pavasal-500 px-2.5 py-1.5 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40"
                  >
                    Enviar
                  </button>
                </form>
              )}
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
          BCF 3.0 ({statsQuery.data?.total ?? topicsQuery.data?.length ?? 0})
        </h3>
        {canEditBcf && (
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setIsCreating(true);
            }}
            className="rounded bg-pavasal-500 px-2.5 py-1 text-[11px] font-bold text-asphalt-950 hover:bg-pavasal-400 transition-colors"
          >
            + Nuevo Topic
          </button>
        )}
      </div>

      <div className="flex gap-1.5">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar..."
          className="flex-1 rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1 text-white placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-asphalt-700 bg-asphalt-800 px-1.5 py-1 text-white focus:border-pavasal-500 focus:outline-none"
        >
          <option value="">Todos</option>
          {topicStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {topicsQuery.isError && (
        <div className="rounded border border-red-700/70 bg-red-950/60 p-2 text-[11px] text-red-200">
          {getApiErrorMessage(topicsQuery.error)}
        </div>
      )}

      {topicsQuery.isLoading ? (
        <p className="text-asphalt-400 py-4 text-center">Cargando Topics...</p>
      ) : (topicsQuery.data || []).length === 0 ? (
        <p className="rounded border border-dashed border-asphalt-700 p-4 text-center text-asphalt-400">
          No hay incidencias BCF registradas con los filtros actuales.
        </p>
      ) : (
        <div className="space-y-2">
          {(topicsQuery.data || []).map((topic) => (
            <button
              key={topic.guid}
              type="button"
              onClick={() => setActiveBcfTopicId(topic.guid)}
              className="w-full text-left rounded border border-asphalt-700 bg-asphalt-800/70 hover:bg-asphalt-800 hover:border-pavasal-500/70 p-2.5 transition-colors space-y-2"
            >
              {topic.default_snapshot_file_id && (
                <AuthenticatedImage
                  src={`/projects/${encodeURIComponent(projectId)}/bcf/images/${encodeURIComponent(topic.default_snapshot_file_id)}`}
                  alt={topic.title}
                  className="w-full h-24 object-cover rounded border border-asphalt-700"
                />
              )}

              <div>
                <div className="flex items-center justify-between gap-2 text-[10px] text-asphalt-400">
                  <span className="font-mono font-semibold text-pavasal-400">
                    {topic.server_assigned_id || topic.guid.slice(0, 8)}
                  </span>
                  <span className="rounded bg-asphalt-950 border border-asphalt-700 px-1.5 py-0.5 text-asphalt-100">
                    {topic.topic_status}
                  </span>
                </div>
                <div className="font-medium text-asphalt-50 mt-0.5 line-clamp-2">
                  {topic.title}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-asphalt-400">
                <span>
                  {topic.topic_type}
                  {topic.priority ? ` · ${topic.priority}` : ''}
                </span>
                <span>
                  {topic.viewpoints_count ?? 0} vistas ·{' '}
                  {topic.comments_count ?? 0} com.
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default BcfIssuesPanel;
