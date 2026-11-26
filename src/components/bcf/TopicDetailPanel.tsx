import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bcfService } from '../../api/bcf.service';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { useProjectRole } from '../../hooks/useProjectRole';
import type { ProjectMember } from '../../types/api.types';
import type {
  BcfDocument,
  BcfDocumentReference,
  BcfProjectExtensions,
  BcfTopic,
  BcfViewpoint,
  CreateTopicPayload,
  CreateViewpointPayload,
  PutTopicPayload,
} from '../../types/bcf.types';
import { useEngine } from '../../viewer/EngineContext';
import { AuthenticatedImage } from '../common/AuthenticatedImage';
import {
  getInitials,
  getPriorityIndicator,
  getStatusBadgeStyle,
} from './TopicListPanel';

interface TopicDetailPanelProps {
  mode: 'create' | 'detail';
  projectId: string;
  topicGuid: string | null;
  extensions: BcfProjectExtensions | undefined;
  members: ProjectMember[];
  onBack: () => void;
  onTopicCreated: (topic: BcfTopic) => void;
  onTopicDeleted: () => void;
  onRequestCaptureViewpoint: (
    modalTitle?: string,
  ) => Promise<CreateViewpointPayload | null>;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toInputDateValue(iso?: string): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const TopicDetailPanel: React.FC<TopicDetailPanelProps> = ({
  mode,
  projectId,
  topicGuid,
  extensions,
  members,
  onBack,
  onTopicCreated,
  onTopicDeleted,
  onRequestCaptureViewpoint,
}) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { canEditBcf, isAdmin } = useProjectRole();
  const { isEngineReady, applyBcfViewpoint } = useEngine();

  const topicTypes = useMemo(
    () =>
      extensions?.topic_type?.length
        ? extensions.topic_type
        : ['Issue', 'Clash', 'Error', 'Request'],
    [extensions?.topic_type],
  );
  const topicStatuses = useMemo(
    () =>
      extensions?.topic_status?.length
        ? extensions.topic_status
        : ['Open', 'In Progress', 'Resolved', 'Closed'],
    [extensions?.topic_status],
  );
  const priorities = useMemo(
    () => extensions?.priority ?? [],
    [extensions?.priority],
  );
  const stages = useMemo(() => extensions?.stage ?? [], [extensions?.stage]);
  const availableLabels = useMemo(
    () => extensions?.topic_label ?? [],
    [extensions?.topic_label],
  );

  const memberByEmail = useMemo(() => {
    const map = new Map<string, ProjectMember>();
    for (const m of members) {
      map.set(m.email.toLowerCase(), m);
    }
    return map;
  }, [members]);

  const assignableUsers = useMemo(() => {
    if (extensions?.user_id_type && extensions.user_id_type.length > 0) {
      return extensions.user_id_type;
    }
    return members.map((m) => m.email);
  }, [extensions?.user_id_type, members]);

  const defaultStatus = useMemo(
    () =>
      topicStatuses.includes('Open') ? 'Open' : topicStatuses[0] ?? 'Open',
    [topicStatuses],
  );

  // Form state (used for Create and Edit Metadata)
  const [title, setTitle] = useState('');
  const [topicType, setTopicType] = useState(topicTypes[0] ?? 'Issue');
  const [topicStatus, setTopicStatus] = useState(defaultStatus);
  const [priority, setPriority] = useState('');
  const [stage, setStage] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [captureInitialViewpoint, setCaptureInitialViewpoint] = useState(true);

  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeAppliedVpGuid, setActiveAppliedVpGuid] = useState<string | null>(
    null,
  );

  // Documents section state
  const [docTab, setDocTab] = useState<'none' | 'upload' | 'existing' | 'url'>(
    'none',
  );
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [selectedExistingDocGuid, setSelectedExistingDocGuid] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [docDescription, setDocDescription] = useState('');

  // Comments composer state
  const [commentText, setCommentText] = useState('');
  const [attachViewToComment, setAttachViewToComment] = useState(false);

  // Keep defaults aligned with dynamically loaded extensions in Create mode
  useEffect(() => {
    if (mode !== 'create') return;
    setTopicType((prev) =>
      topicTypes.includes(prev) ? prev : topicTypes[0] ?? 'Issue',
    );
    setTopicStatus((prev) =>
      topicStatuses.includes(prev) ? prev : defaultStatus,
    );
  }, [defaultStatus, mode, topicStatuses, topicTypes]);

  const topicQuery = useQuery({
    queryKey: ['bcf-topic', projectId, topicGuid],
    queryFn: () => bcfService.getTopicById(projectId, topicGuid!, true),
    enabled: mode === 'detail' && Boolean(projectId && topicGuid),
  });

  const docRefsQuery = useQuery({
    queryKey: ['bcf-doc-refs', projectId, topicGuid],
    queryFn: () => bcfService.getDocumentReferences(projectId, topicGuid!),
    enabled: mode === 'detail' && Boolean(projectId && topicGuid),
  });

  const projectDocsQuery = useQuery({
    queryKey: ['bcf-project-docs', projectId],
    queryFn: () => bcfService.getDocuments(projectId),
    enabled: mode === 'detail' && Boolean(projectId),
  });

  const projectDocByGuid = useMemo(() => {
    const map = new Map<string, BcfDocument>();
    for (const d of projectDocsQuery.data ?? []) {
      map.set(d.guid, d);
    }
    return map;
  }, [projectDocsQuery.data]);

  const topic = topicQuery.data;

  const populateFormFromTopic = (t: BcfTopic) => {
    setTitle(t.title || '');
    setTopicType(
      topicTypes.includes(t.topic_type)
        ? t.topic_type
        : topicTypes[0] ?? t.topic_type,
    );
    setTopicStatus(
      topicStatuses.includes(t.topic_status)
        ? t.topic_status
        : defaultStatus,
    );
    setPriority(t.priority && priorities.includes(t.priority) ? t.priority : '');
    setStage(t.stage && stages.includes(t.stage) ? t.stage : '');
    setAssignedTo(t.assigned_to || '');
    setDueDate(toInputDateValue(t.due_date));
    setSelectedLabels(
      (t.labels ?? []).filter(
        (l) => availableLabels.length === 0 || availableLabels.includes(l),
      ),
    );
    setDescription(t.description || '');
  };

  const invalidateTopicData = (targetGuid?: string | null) => {
    const g = targetGuid ?? topicGuid;
    queryClient.invalidateQueries({ queryKey: ['bcf-topics', projectId] });
    queryClient.invalidateQueries({ queryKey: ['bcf-topics-pins', projectId] });
    queryClient.invalidateQueries({ queryKey: ['bcf-stats', projectId] });
    if (g) {
      queryClient.invalidateQueries({ queryKey: ['bcf-topic', projectId, g] });
      queryClient.invalidateQueries({
        queryKey: ['bcf-doc-refs', projectId, g],
      });
    }
  };

  const toggleLabel = (lbl: string) => {
    setSelectedLabels((prev) =>
      prev.includes(lbl) ? prev.filter((item) => item !== lbl) : [...prev, lbl],
    );
  };

  // --- Mutations ---
  const createTopicMutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null);
      let initialVpPayload: CreateViewpointPayload | null = null;
      if (captureInitialViewpoint && isEngineReady) {
        initialVpPayload = await onRequestCaptureViewpoint(
          'Capturar punto de vista inicial del tópico',
        );
        if (!initialVpPayload) {
          throw new Error('__CANCELLED__');
        }
      }

      const payload: CreateTopicPayload = {
        title: title.trim(),
        topic_type: topicType,
        topic_status: topicStatus,
        ...(priority ? { priority } : {}),
        ...(stage ? { stage } : {}),
        ...(assignedTo ? { assigned_to: assignedTo } : {}),
        ...(dueDate ? { due_date: dueDate } : {}),
        ...(selectedLabels.length > 0 ? { labels: selectedLabels } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      };

      const created = await bcfService.createTopic(projectId, payload);
      if (initialVpPayload) {
        await bcfService.createViewpoint(
          projectId,
          created.guid,
          initialVpPayload,
        );
      }
      return created;
    },
    onSuccess: (created) => {
      invalidateTopicData(created.guid);
      onTopicCreated(created);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === '__CANCELLED__') return;
      setErrorMsg(getApiErrorMessage(err));
    },
  });

  const updateMetadataMutation = useMutation({
    mutationFn: async () => {
      if (!topicGuid) throw new Error('Tópico no válido');
      const payload: PutTopicPayload = {
        title: title.trim(),
        topic_type: topicType,
        topic_status: topicStatus,
        ...(priority ? { priority } : {}),
        ...(stage ? { stage } : {}),
        ...(assignedTo ? { assigned_to: assignedTo } : {}),
        ...(dueDate ? { due_date: dueDate } : {}),
        labels: selectedLabels,
        description: description.trim(),
      };
      return bcfService.putTopic(projectId, topicGuid, payload);
    },
    onSuccess: () => {
      setErrorMsg(null);
      setIsEditingMetadata(false);
      invalidateTopicData();
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const quickStatusMutation = useMutation({
    mutationFn: (nextStatus: string) =>
      bcfService.patchTopic(projectId, topicGuid!, {
        topic_status: nextStatus,
      }),
    onSuccess: () => {
      setErrorMsg(null);
      invalidateTopicData();
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const deleteTopicMutation = useMutation({
    mutationFn: () => bcfService.deleteTopic(projectId, topicGuid!),
    onSuccess: () => {
      invalidateTopicData();
      onTopicDeleted();
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const addViewpointMutation = useMutation({
    mutationFn: async () => {
      if (!topicGuid) throw new Error('Tópico no válido');
      const vpPayload = await onRequestCaptureViewpoint(
        'Añadir punto de vista actual al tópico',
      );
      if (!vpPayload) {
        throw new Error('__CANCELLED__');
      }
      return bcfService.createViewpoint(projectId, topicGuid, vpPayload);
    },
    onSuccess: () => {
      setErrorMsg(null);
      invalidateTopicData();
    },
    onError: (err) => {
      if (err instanceof Error && err.message === '__CANCELLED__') return;
      setErrorMsg(getApiErrorMessage(err));
    },
  });

  const deleteViewpointMutation = useMutation({
    mutationFn: (vpGuid: string) =>
      bcfService.deleteViewpoint(projectId, topicGuid!, vpGuid),
    onSuccess: () => {
      setErrorMsg(null);
      invalidateTopicData();
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const addDocumentRefMutation = useMutation({
    mutationFn: async () => {
      if (!topicGuid) throw new Error('Tópico no válido');

      if (docTab === 'upload') {
        if (!uploadFile) {
          throw new Error('Selecciona un archivo para subir.');
        }
        const uploaded = await bcfService.uploadDocument(
          projectId,
          uploadFile,
          docDescription.trim() || undefined,
        );
        return bcfService.createDocumentReference(projectId, topicGuid, {
          document_guid: uploaded.guid,
          description: docDescription.trim() || uploaded.filename,
        });
      }

      if (docTab === 'existing') {
        if (!selectedExistingDocGuid) {
          throw new Error('Selecciona un documento existente del proyecto.');
        }
        return bcfService.createDocumentReference(projectId, topicGuid, {
          document_guid: selectedExistingDocGuid,
          description: docDescription.trim() || undefined,
        });
      }

      if (docTab === 'url') {
        const cleanUrl = externalUrl.trim();
        if (!/^https?:\/\/.+/i.test(cleanUrl)) {
          throw new Error('Introduce una URL válida (https://...).');
        }
        return bcfService.createDocumentReference(projectId, topicGuid, {
          url: cleanUrl,
          description: docDescription.trim() || undefined,
        });
      }

      throw new Error('Modo de adjunto no seleccionado.');
    },
    onSuccess: () => {
      setErrorMsg(null);
      setDocTab('none');
      setUploadFile(null);
      setSelectedExistingDocGuid('');
      setExternalUrl('');
      setDocDescription('');
      queryClient.invalidateQueries({
        queryKey: ['bcf-project-docs', projectId],
      });
      invalidateTopicData();
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const deleteDocumentRefMutation = useMutation({
    mutationFn: (docRefGuid: string) =>
      bcfService.deleteDocumentReference(projectId, topicGuid!, docRefGuid),
    onSuccess: () => {
      setErrorMsg(null);
      invalidateTopicData();
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      if (!topicGuid) throw new Error('Tópico no válido');
      const trimmed = commentText.trim();
      if (!trimmed && !attachViewToComment) {
        throw new Error(
          'Escribe un comentario o activa "Adjuntar vista 3D actual".',
        );
      }

      let attachedVpGuid: string | undefined;
      if (attachViewToComment && isEngineReady) {
        const vpPayload = await onRequestCaptureViewpoint(
          'Capturar vista 3D para adjuntar al comentario',
        );
        if (!vpPayload) {
          throw new Error('__CANCELLED__');
        }
        const createdVp = await bcfService.createViewpoint(
          projectId,
          topicGuid,
          vpPayload,
        );
        attachedVpGuid = createdVp.guid;
      }

      return bcfService.createComment(projectId, topicGuid, {
        ...(trimmed ? { comment: trimmed } : {}),
        ...(attachedVpGuid ? { viewpoint_guid: attachedVpGuid } : {}),
      });
    },
    onSuccess: () => {
      setErrorMsg(null);
      setCommentText('');
      setAttachViewToComment(false);
      invalidateTopicData();
    },
    onError: (err) => {
      if (err instanceof Error && err.message === '__CANCELLED__') return;
      setErrorMsg(getApiErrorMessage(err));
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentGuid: string) =>
      bcfService.deleteComment(projectId, topicGuid!, commentGuid),
    onSuccess: () => {
      setErrorMsg(null);
      invalidateTopicData();
    },
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const handleApplyViewpoint = async (vp: BcfViewpoint) => {
    if (!isEngineReady) return;
    setActiveAppliedVpGuid(vp.guid);
    try {
      await applyBcfViewpoint(vp);
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err));
    }
  };

  const canDeleteAuthorResource = (
    authorUid?: string,
    authorEmail?: string,
  ): boolean => {
    if (isAdmin) return true;
    if (!canEditBcf || !user) return false;
    if (authorUid && user.uid === authorUid) return true;
    if (
      authorEmail &&
      user.email &&
      authorEmail.toLowerCase() === user.email.toLowerCase()
    ) {
      return true;
    }
    return false;
  };

  const renderMetadataFormFields = () => (
    <div className="space-y-2.5">
      <div>
        <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
          Título *
        </label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Interferencia bajante pluvial con viga P-12"
          className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2.5 py-1.5 text-asphalt-50 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
            Tipo *
          </label>
          <select
            required
            value={topicType}
            onChange={(e) => setTopicType(e.target.value)}
            className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1.5 text-asphalt-50 focus:border-pavasal-500 focus:outline-none"
          >
            {topicTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
            Estado *
          </label>
          <select
            required
            value={topicStatus}
            onChange={(e) => setTopicStatus(e.target.value)}
            className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1.5 text-asphalt-50 focus:border-pavasal-500 focus:outline-none"
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
          <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
            Prioridad
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1.5 text-asphalt-50 focus:border-pavasal-500 focus:outline-none"
          >
            <option value="">Sin especificar</option>
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
            Fase / Etapa
          </label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1.5 text-asphalt-50 focus:border-pavasal-500 focus:outline-none"
          >
            <option value="">Sin especificar</option>
            {stages.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
            Asignado a
          </label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1.5 text-asphalt-50 focus:border-pavasal-500 focus:outline-none"
          >
            <option value="">Sin asignar</option>
            {assignableUsers.map((email) => {
              const member = memberByEmail.get(email.toLowerCase());
              return (
                <option key={email} value={email}>
                  {member?.displayName
                    ? `${member.displayName} (${email})`
                    : email}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
            Fecha límite
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1.5 text-asphalt-50 focus:border-pavasal-500 focus:outline-none"
          />
        </div>
      </div>

      {availableLabels.length > 0 && (
        <div>
          <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
            Etiquetas / Disciplinas
          </label>
          <div className="flex flex-wrap gap-1">
            {availableLabels.map((lbl) => {
              const selected = selectedLabels.includes(lbl);
              return (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => toggleLabel(lbl)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                    selected
                      ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950 font-bold'
                      : 'border-asphalt-700 bg-asphalt-900 text-asphalt-300 hover:border-pavasal-500/50'
                  }`}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
          Descripción
        </label>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe la incidencia, ubicación o acción requerida..."
          className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2.5 py-1.5 text-asphalt-50 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
        />
      </div>
    </div>
  );

  // =========================================================================
  // CREATE VIEW
  // =========================================================================
  if (mode === 'create') {
    return (
      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between border-b border-asphalt-700 pb-2">
          <h3 className="font-bold text-pavasal-400 uppercase tracking-wider text-[11px]">
            Nuevo Tópico BCF 3.0
          </h3>
          <button
            type="button"
            onClick={onBack}
            className="text-asphalt-400 hover:text-asphalt-100"
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
            if (!title.trim()) return;
            createTopicMutation.mutate();
          }}
          className="space-y-3"
        >
          {renderMetadataFormFields()}

          <label className="flex items-start gap-2 rounded border border-asphalt-700 bg-asphalt-950/60 p-2 text-[11px] text-asphalt-200 cursor-pointer">
            <input
              type="checkbox"
              checked={captureInitialViewpoint}
              disabled={!isEngineReady}
              onChange={(e) => setCaptureInitialViewpoint(e.target.checked)}
              className="mt-0.5 accent-pavasal-500"
            />
            <span>
              <strong className="block text-asphalt-100">
                Capturar punto de vista 3D actual
              </strong>
              <span className="text-[10px] text-asphalt-400">
                Guarda cámara Z-up, selección, visibilidad, colores, secciones y
                abre el editor de anotaciones 2D.
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={createTopicMutation.isPending || !title.trim()}
            className="w-full rounded bg-pavasal-500 py-2 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50 transition-colors"
          >
            {createTopicMutation.isPending
              ? 'Creando tópico...'
              : 'Crear Tópico BCF 3.0'}
          </button>
        </form>
      </div>
    );
  }

  // =========================================================================
  // DETAIL VIEW
  // =========================================================================
  if (topicQuery.isLoading || !topic) {
    return (
      <div className="space-y-3 text-xs">
        <button
          type="button"
          onClick={onBack}
          className="text-pavasal-400 hover:text-pavasal-300 font-semibold"
        >
          ← Volver a la lista
        </button>
        <div className="py-6 text-center text-asphalt-400">
          {topicQuery.isError
            ? getApiErrorMessage(topicQuery.error)
            : 'Cargando detalle del tópico...'}
        </div>
      </div>
    );
  }

  const viewpoints = topic.viewpoints ?? [];
  const viewpointByGuid = new Map(viewpoints.map((vp) => [vp.guid, vp]));
  const comments = topic.comments ?? [];
  const docRefs: BcfDocumentReference[] =
    docRefsQuery.data ?? topic.document_references ?? [];

  const assigneeMember = topic.assigned_to
    ? memberByEmail.get(topic.assigned_to.toLowerCase())
    : undefined;
  const assigneeLabel =
    assigneeMember?.displayName || topic.assigned_to || 'Sin asignar';
  const prioInfo = getPriorityIndicator(topic.priority);

  return (
    <div className="space-y-3.5 text-xs">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-asphalt-700 pb-2 gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-pavasal-400 hover:text-pavasal-300 font-semibold shrink-0"
        >
          ← Tópicos
        </button>

        <div className="flex items-center gap-2">
          {canEditBcf && !isEditingMetadata && (
            <button
              type="button"
              onClick={() => {
                populateFormFromTopic(topic);
                setIsEditingMetadata(true);
              }}
              className="text-[11px] font-medium text-asphalt-200 hover:text-pavasal-400 transition-colors"
            >
              Editar
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              disabled={deleteTopicMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `¿Eliminar definitivamente el tópico ${topic.server_assigned_id || topic.title}?`,
                  )
                ) {
                  deleteTopicMutation.mutate();
                }
              }}
              className="text-[11px] font-medium text-red-400 hover:text-red-300 disabled:opacity-40"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded border border-red-700/70 bg-red-950/60 p-2 text-[11px] text-red-200">
          {errorMsg}
        </div>
      )}

      {/* 1. Metadata Card or Edit Form */}
      {isEditingMetadata ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            updateMetadataMutation.mutate();
          }}
          className="rounded-md border border-pavasal-500/60 bg-asphalt-950/80 p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pavasal-400">
              Editar metadatos ({topic.server_assigned_id || 'BCF'})
            </span>
            <button
              type="button"
              onClick={() => setIsEditingMetadata(false)}
              className="text-[11px] text-asphalt-400 hover:text-asphalt-100"
            >
              Cancelar
            </button>
          </div>

          {renderMetadataFormFields()}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsEditingMetadata(false)}
              className="px-2.5 py-1.5 rounded border border-asphalt-700 bg-asphalt-800 text-asphalt-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={updateMetadataMutation.isPending || !title.trim()}
              className="px-3 py-1.5 rounded bg-pavasal-500 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50"
            >
              {updateMetadataMutation.isPending
                ? 'Guardando...'
                : 'Guardar cambios'}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-md border border-asphalt-700 border-l-2 border-l-pavasal-500 bg-asphalt-900/70 p-3 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="rounded bg-asphalt-950 border border-asphalt-700 px-1.5 py-0.5 font-mono text-[10px] font-bold text-pavasal-400">
                  {topic.server_assigned_id || topic.guid.slice(0, 8)}
                </span>
                <span className="rounded bg-asphalt-950 px-1.5 py-0.5 text-[10px] text-asphalt-200">
                  {topic.topic_type}
                </span>
                {topic.priority && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] ${prioInfo.textClass}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${prioInfo.dotClass}`}
                    />
                    {topic.priority}
                  </span>
                )}
                {topic.stage && (
                  <span className="rounded bg-asphalt-800 px-1.5 py-0.5 text-[10px] text-asphalt-300">
                    {topic.stage}
                  </span>
                )}
              </div>
              <h4 className="font-bold text-asphalt-50 text-sm leading-snug">
                {topic.title}
              </h4>
            </div>
          </div>

          {(topic.labels ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(topic.labels ?? []).map((lbl) => (
                <span
                  key={lbl}
                  className="rounded-full bg-pavasal-500/15 border border-pavasal-500/35 px-2 py-0.5 text-[10px] font-medium text-pavasal-300"
                >
                  {lbl}
                </span>
              ))}
            </div>
          )}

          {topic.description && (
            <p className="text-asphalt-200 whitespace-pre-wrap leading-relaxed">
              {topic.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-asphalt-800 text-[11px]">
            <div className="min-w-0">
              <span className="block text-[10px] text-asphalt-400">
                Asignado a
              </span>
              <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                {assigneeMember?.photoURL ? (
                  <img
                    src={assigneeMember.photoURL}
                    alt={assigneeLabel}
                    referrerPolicy="no-referrer"
                    className="w-4 h-4 rounded-full object-cover shrink-0"
                  />
                ) : topic.assigned_to ? (
                  <span className="w-4 h-4 rounded-full bg-pavasal-500/20 text-[9px] font-bold text-pavasal-300 flex items-center justify-center shrink-0">
                    {getInitials(assigneeLabel)}
                  </span>
                ) : null}
                <span className="text-asphalt-100 truncate">
                  {assigneeLabel}
                </span>
              </div>
            </div>

            <div>
              <span className="block text-[10px] text-asphalt-400">
                Fecha límite
              </span>
              <span className="mt-0.5 block text-asphalt-100">
                {topic.due_date ? toInputDateValue(topic.due_date) : '—'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-asphalt-800 flex items-center justify-between gap-2">
            <span className="text-[10px] text-asphalt-400 truncate">
              Creado por {topic.creation_author}
            </span>
            {canEditBcf ? (
              <select
                value={topic.topic_status}
                disabled={quickStatusMutation.isPending}
                onChange={(e) => quickStatusMutation.mutate(e.target.value)}
                aria-label="Cambiar estado del tópico"
                className="rounded border border-asphalt-700 bg-asphalt-950 px-2 py-1 text-[11px] font-semibold text-asphalt-100 focus:border-pavasal-500 focus:outline-none"
              >
                {topicStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeStyle(topic.topic_status)}`}
              >
                {topic.topic_status}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 2. Viewpoints Gallery (ViewpointsSection) */}
      <section className="space-y-2 pt-1 border-t border-asphalt-800">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
            Puntos de vista ({viewpoints.length})
          </h5>
          {canEditBcf && (
            <button
              type="button"
              disabled={!isEngineReady || addViewpointMutation.isPending}
              onClick={() => addViewpointMutation.mutate()}
              className="rounded bg-pavasal-500 px-2 py-1 text-[10px] font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 transition-colors"
            >
              {addViewpointMutation.isPending
                ? 'Guardando...'
                : '+ Añadir Punto de Vista Actual'}
            </button>
          )}
        </div>

        {viewpoints.length === 0 ? (
          <p className="rounded border border-dashed border-asphalt-700 p-3 text-center text-[11px] text-asphalt-400">
            Este tópico aún no tiene puntos de vista guardados.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {viewpoints.map((vp, idx) => {
              const imgSrc = bcfService.resolveViewpointSnapshotPath(
                projectId,
                topic.guid,
                vp,
              );
              const selCount = vp.components?.selection?.length ?? 0;
              const clipCount = vp.clipping_planes?.length ?? 0;
              const colorCount = vp.components?.coloring?.length ?? 0;
              const isApplied = activeAppliedVpGuid === vp.guid;
              const canDeleteVp = canDeleteAuthorResource(
                vp.creation_author_uid,
                vp.creation_author,
              );

              return (
                <div
                  key={vp.guid}
                  className={`group relative rounded border overflow-hidden transition-colors ${
                    isApplied
                      ? 'border-pavasal-500 ring-1 ring-pavasal-500/50 bg-asphalt-900'
                      : 'border-asphalt-700 bg-asphalt-950 hover:border-pavasal-500/70'
                  }`}
                >
                  <button
                    type="button"
                    disabled={!isEngineReady}
                    onClick={() => void handleApplyViewpoint(vp)}
                    className="w-full text-left disabled:opacity-50"
                    title="Restaurar cámara, visibilidad, selección, colores y secciones en el visor 3D"
                  >
                    <AuthenticatedImage
                      src={imgSrc}
                      alt={`Punto de vista ${idx + 1}`}
                      className="w-full h-24 object-cover"
                    />
                    <div className="p-1.5 bg-asphalt-900 space-y-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-asphalt-100">
                          Vista #{idx + 1}
                        </span>
                        <span className="text-pavasal-400 font-semibold">
                          Aplicar 3D
                        </span>
                      </div>
                      {(selCount > 0 || clipCount > 0 || colorCount > 0) && (
                        <div className="flex flex-wrap gap-1 text-[9px] text-asphalt-400">
                          {selCount > 0 && <span>{selCount} sel.</span>}
                          {clipCount > 0 && <span>{clipCount} cortes</span>}
                          {colorCount > 0 && <span>{colorCount} col.</span>}
                        </div>
                      )}
                    </div>
                  </button>

                  {canDeleteVp && (
                    <button
                      type="button"
                      onClick={() =>
                        deleteViewpointMutation.mutate(vp.guid)
                      }
                      className="absolute top-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-red-300 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-200"
                      title="Eliminar punto de vista"
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

      {/* 3. Attached Documents Section (DocumentsSection) */}
      <section className="space-y-2 pt-2 border-t border-asphalt-800">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
            Documentos ({docRefs.length})
          </h5>
          {canEditBcf && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setDocTab((prev) => (prev === 'upload' ? 'none' : 'upload'))
                }
                className={`rounded px-1.5 py-0.5 text-[10px] border transition-colors ${
                  docTab === 'upload'
                    ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950 font-bold'
                    : 'border-asphalt-700 bg-asphalt-900 text-asphalt-200 hover:border-pavasal-500/50'
                }`}
              >
                + Subir
              </button>
              <button
                type="button"
                onClick={() =>
                  setDocTab((prev) =>
                    prev === 'existing' ? 'none' : 'existing',
                  )
                }
                className={`rounded px-1.5 py-0.5 text-[10px] border transition-colors ${
                  docTab === 'existing'
                    ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950 font-bold'
                    : 'border-asphalt-700 bg-asphalt-900 text-asphalt-200 hover:border-pavasal-500/50'
                }`}
              >
                Vincular
              </button>
              <button
                type="button"
                onClick={() =>
                  setDocTab((prev) => (prev === 'url' ? 'none' : 'url'))
                }
                className={`rounded px-1.5 py-0.5 text-[10px] border transition-colors ${
                  docTab === 'url'
                    ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950 font-bold'
                    : 'border-asphalt-700 bg-asphalt-900 text-asphalt-200 hover:border-pavasal-500/50'
                }`}
              >
                + URL
              </button>
            </div>
          )}
        </div>

        {docTab !== 'none' && canEditBcf && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addDocumentRefMutation.mutate();
            }}
            className="rounded border border-asphalt-700 bg-asphalt-950/70 p-2.5 space-y-2"
          >
            {docTab === 'upload' && (
              <div>
                <label className="block text-[10px] text-asphalt-300 mb-1">
                  Archivo nuevo (PDF, plano, imagen...)
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="w-full text-[11px] text-asphalt-200 file:mr-2 file:rounded file:border-0 file:bg-asphalt-800 file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-pavasal-400"
                />
              </div>
            )}

            {docTab === 'existing' && (
              <div>
                <label className="block text-[10px] text-asphalt-300 mb-1">
                  Documento ya subido al proyecto
                </label>
                <select
                  required
                  value={selectedExistingDocGuid}
                  onChange={(e) => setSelectedExistingDocGuid(e.target.value)}
                  className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1 text-[11px] text-asphalt-100 focus:border-pavasal-500 focus:outline-none"
                >
                  <option value="">Seleccionar documento...</option>
                  {(projectDocsQuery.data ?? []).map((doc) => (
                    <option key={doc.guid} value={doc.guid}>
                      {doc.filename}
                      {doc.size ? ` (${formatFileSize(doc.size)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {docTab === 'url' && (
              <div>
                <label className="block text-[10px] text-asphalt-300 mb-1">
                  Enlace externo (URL)
                </label>
                <input
                  type="url"
                  required
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1 text-[11px] text-asphalt-100 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
                />
              </div>
            )}

            <input
              type="text"
              value={docDescription}
              onChange={(e) => setDocDescription(e.target.value)}
              placeholder="Descripción opcional..."
              className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1 text-[11px] text-asphalt-100 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
            />

            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setDocTab('none')}
                className="px-2 py-1 rounded border border-asphalt-700 text-[10px] text-asphalt-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={addDocumentRefMutation.isPending}
                className="px-2.5 py-1 rounded bg-pavasal-500 text-[10px] font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-50"
              >
                {addDocumentRefMutation.isPending
                  ? 'Vinculando...'
                  : 'Adjuntar al tópico'}
              </button>
            </div>
          </form>
        )}

        {docRefs.length === 0 ? (
          <p className="text-[11px] text-asphalt-400">
            Sin documentos ni enlaces adjuntos.
          </p>
        ) : (
          <div className="space-y-1.5">
            {docRefs.map((ref) => {
              const linkedDoc = ref.document_guid
                ? projectDocByGuid.get(ref.document_guid)
                : undefined;
              const displayTitle =
                ref.description ||
                linkedDoc?.filename ||
                ref.filename ||
                ref.url ||
                'Documento adjunto';

              return (
                <div
                  key={ref.guid}
                  className="rounded border border-asphalt-700 bg-asphalt-900/70 px-2.5 py-1.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[11px] font-medium text-asphalt-100 truncate"
                      title={displayTitle}
                    >
                      {ref.url ? '🔗 ' : '📄 '}
                      {displayTitle}
                    </div>
                    {linkedDoc && (
                      <div className="text-[10px] text-asphalt-400 truncate">
                        {linkedDoc.filename}
                        {linkedDoc.size
                          ? ` · ${formatFileSize(linkedDoc.size)}`
                          : ''}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {ref.url ? (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded bg-asphalt-800 px-2 py-0.5 text-[10px] font-semibold text-pavasal-400 hover:text-pavasal-300"
                      >
                        Abrir
                      </a>
                    ) : ref.document_guid ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void bcfService.downloadDocument(
                              projectId,
                              ref.document_guid!,
                              linkedDoc?.filename || displayTitle,
                              true,
                            )
                          }
                          className="rounded bg-asphalt-800 px-1.5 py-0.5 text-[10px] font-medium text-asphalt-200 hover:text-pavasal-300"
                          title="Vista previa en pestaña nueva"
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void bcfService.downloadDocument(
                              projectId,
                              ref.document_guid!,
                              linkedDoc?.filename || displayTitle,
                              false,
                            )
                          }
                          className="rounded bg-asphalt-800 px-1.5 py-0.5 text-[10px] font-semibold text-pavasal-400 hover:text-pavasal-300"
                          title="Descargar documento"
                        >
                          Descargar
                        </button>
                      </>
                    ) : null}

                    {canEditBcf && (
                      <button
                        type="button"
                        onClick={() =>
                          deleteDocumentRefMutation.mutate(ref.guid)
                        }
                        className="text-[10px] text-red-400 hover:text-red-300 px-1"
                        title="Desvincular documento"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Activity & Comments Thread (CommentsThread) */}
      <section className="space-y-2 pt-2 border-t border-asphalt-800">
        <h5 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
          Comentarios y actividad ({comments.length})
        </h5>

        {comments.length === 0 ? (
          <p className="text-[11px] text-asphalt-400">
            Aún no hay comentarios en este tópico.
          </p>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => {
              const authorMember = c.author
                ? memberByEmail.get(c.author.toLowerCase())
                : undefined;
              const authorName = authorMember?.displayName || c.author;
              const associatedVp = c.viewpoint_guid
                ? viewpointByGuid.get(c.viewpoint_guid)
                : undefined;
              const commentThumbSrc = c.viewpoint_guid
                ? associatedVp
                  ? bcfService.resolveViewpointSnapshotPath(
                      projectId,
                      topic.guid,
                      associatedVp,
                    )
                  : `/bcf/3.0/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topic.guid)}/viewpoints/${encodeURIComponent(c.viewpoint_guid)}/snapshot`
                : null;
              const canDeleteCom = canDeleteAuthorResource(
                c.author_uid,
                c.author,
              );

              return (
                <div
                  key={c.guid}
                  className="rounded border border-asphalt-700 bg-asphalt-900/65 p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {authorMember?.photoURL ? (
                        <img
                          src={authorMember.photoURL}
                          alt={authorName}
                          referrerPolicy="no-referrer"
                          className="w-4 h-4 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-pavasal-500/20 text-[9px] font-bold text-pavasal-300 flex items-center justify-center shrink-0">
                          {getInitials(authorName)}
                        </span>
                      )}
                      <span className="font-semibold text-pavasal-300 truncate">
                        {authorName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-asphalt-400 shrink-0">
                      <span>{formatDateTime(c.date)}</span>
                      {canDeleteCom && (
                        <button
                          type="button"
                          onClick={() => deleteCommentMutation.mutate(c.guid)}
                          className="text-red-400 hover:text-red-300"
                          title="Eliminar comentario"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {c.comment && (
                    <p className="text-asphalt-100 whitespace-pre-wrap leading-relaxed">
                      {c.comment}
                    </p>
                  )}

                  {c.viewpoint_guid && commentThumbSrc && (
                    <button
                      type="button"
                      disabled={!isEngineReady}
                      onClick={async () => {
                        const vp =
                          associatedVp ??
                          (await bcfService
                            .getViewpoint(
                              projectId,
                              topic.guid,
                              c.viewpoint_guid!,
                            )
                            .catch(() => null));
                        if (vp) {
                          await handleApplyViewpoint(vp);
                        }
                      }}
                      className="block w-full max-w-[220px] rounded border border-asphalt-700 overflow-hidden hover:border-pavasal-500 transition-colors text-left"
                      title="Restaurar en 3D el punto de vista adjunto a este comentario"
                    >
                      <AuthenticatedImage
                        src={commentThumbSrc}
                        alt="Vista adjunta al comentario"
                        className="w-full h-24 object-cover"
                      />
                      <span className="block bg-asphalt-950 px-2 py-0.5 text-[10px] font-semibold text-pavasal-400">
                        📷 Restaurar vista del comentario
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canEditBcf && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!commentText.trim() && !attachViewToComment) return;
              addCommentMutation.mutate();
            }}
            className="space-y-1.5 pt-1"
          >
            <textarea
              rows={2}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Escribe un comentario..."
              className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2.5 py-1.5 text-asphalt-50 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
            />

            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-asphalt-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachViewToComment}
                  disabled={!isEngineReady}
                  onChange={(e) => setAttachViewToComment(e.target.checked)}
                  className="accent-pavasal-500"
                />
                <span>Adjuntar vista 3D actual al comentario</span>
              </label>

              <button
                type="submit"
                disabled={
                  addCommentMutation.isPending ||
                  (!commentText.trim() && !attachViewToComment)
                }
                className="rounded bg-pavasal-500 px-3 py-1 font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 transition-colors shrink-0"
              >
                {addCommentMutation.isPending ? 'Enviando...' : 'Comentar'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};

export default TopicDetailPanel;
