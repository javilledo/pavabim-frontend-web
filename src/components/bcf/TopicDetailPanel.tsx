import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bcfService } from '../../api/bcf.service';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { useProjectRole } from '../../hooks/useProjectRole';
import type { ProjectMember } from '../../types/api.types';
import type {
  BcfProjectExtensions,
  BcfTopic,
  BcfViewpoint,
  CreateTopicPayload,
  CreateViewpointPayload,
  PutTopicPayload,
} from '../../types/bcf.types';
import {
  filterAllowedTopicStatuses,
  PAVABIM_DISCIPLINE_LABELS,
  translateTopicPriority,
  translateTopicStage,
  translateTopicStatus,
  translateTopicType,
} from '../../utils/bcfLabels';
import { useEngine } from '../../viewer/EngineContext';
import { AuthenticatedImage } from '../common/AuthenticatedImage';
import {
  getInitials,
  getPriorityIndicator,
  getStatusBadgeStyle,
} from './TopicListPanel';
import {
  ExpandImageIcon,
  GoToViewpointIcon,
  ViewpointImageModal,
} from './ViewpointImageModal';

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

interface MentionCandidate {
  email: string;
  displayName?: string;
  photoURL?: string;
  mentionToken: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderMentionsInSegment(
  segment: string,
  mentionRegex: RegExp,
  tooltipByLowerToken: Map<string, string>,
  keyPrefix: string,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  mentionRegex.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = mentionRegex.exec(segment)) !== null) {
    const lead = m[1] ?? '';
    const mentionFull = m[2] ?? ''; // starts with '@'
    const mentionStart = m.index + lead.length;

    if (mentionStart > lastIdx) {
      out.push(segment.slice(lastIdx, mentionStart));
    }

    const tokenWithoutAt = mentionFull.slice(1).toLowerCase();
    const tooltip = tooltipByLowerToken.get(tokenWithoutAt);

    out.push(
      <span
        key={`${keyPrefix}-mnt-${mentionStart}`}
        title={tooltip ? `Usuario mencionado: ${tooltip}` : undefined}
        className="inline-block rounded bg-sky-500/15 border border-sky-500/40 px-1 py-px font-semibold text-sky-300"
      >
        {mentionFull}
      </span>,
    );

    lastIdx = mentionStart + mentionFull.length;
  }

  if (lastIdx < segment.length) {
    out.push(segment.slice(lastIdx));
  }

  return out;
}

function renderRichTextWithLinksAndMentions(
  text: string,
  mentionRegex: RegExp,
  tooltipByLowerToken: Map<string, string>,
): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(
        ...renderMentionsInSegment(
          text.slice(lastIndex, start),
          mentionRegex,
          tooltipByLowerToken,
          `seg-${lastIndex}`,
        ),
      );
    }

    let rawUrl = match[0];
    let trailing = '';
    while (/[.,;:!?)\]>]$/.test(rawUrl)) {
      if (rawUrl.endsWith(')')) {
        const openCount = (rawUrl.match(/\(/g) ?? []).length;
        const closeCount = (rawUrl.match(/\)/g) ?? []).length;
        if (closeCount <= openCount) break;
      }
      trailing = rawUrl.slice(-1) + trailing;
      rawUrl = rawUrl.slice(0, -1);
    }

    if (rawUrl) {
      const href = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      nodes.push(
        <a
          key={`lnk-${start}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-pavasal-400 underline hover:text-pavasal-300 break-all"
        >
          {rawUrl}
        </a>,
      );
    }

    if (trailing) {
      nodes.push(trailing);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(
      ...renderMentionsInSegment(
        text.slice(lastIndex),
        mentionRegex,
        tooltipByLowerToken,
        `seg-${lastIndex}`,
      ),
    );
  }

  return nodes.length > 0 ? nodes : text;
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
        : [
          'Clash',
          'Error',
          'Request',
          'Issue',
          'Inquiry',
          'Warning',
          'Info',
          'Remark',
        ],
    [extensions?.topic_type],
  );
  const topicStatuses = useMemo(
    () =>
      filterAllowedTopicStatuses(
        extensions?.topic_status?.length
          ? extensions.topic_status
          : ['Open', 'In Progress', 'Resolved', 'Closed'],
      ),
    [extensions?.topic_status],
  );
  const priorities = useMemo(
    () =>
      extensions?.priority?.length
        ? extensions.priority
        : ['Low', 'Normal', 'High', 'Critical'],
    [extensions?.priority],
  );
  const stages = useMemo(
    () =>
      extensions?.stage?.length
        ? extensions.stage
        : [
          'Design',
          'Pre-construction',
          'Coordination',
          'Construction',
          'Handover',
          'As-Built',
        ],
    [extensions?.stage],
  );
  const availableLabels = PAVABIM_DISCIPLINE_LABELS;

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

  const mentionDirectory = useMemo<MentionCandidate[]>(() => {
    const byEmail = new Map<string, MentionCandidate>();
    for (const m of members) {
      const email = m.email?.trim();
      if (!email) continue;
      const cleanName = m.displayName?.trim() || undefined;
      byEmail.set(email.toLowerCase(), {
        email,
        displayName: cleanName,
        photoURL: m.photoURL,
        mentionToken: cleanName || email,
      });
    }
    for (const rawEmail of assignableUsers) {
      const email = rawEmail?.trim();
      if (!email || byEmail.has(email.toLowerCase())) continue;
      byEmail.set(email.toLowerCase(), {
        email,
        mentionToken: email,
      });
    }
    return Array.from(byEmail.values()).sort((a, b) =>
      (a.displayName || a.email).localeCompare(b.displayName || b.email),
    );
  }, [assignableUsers, members]);

  const { mentionMatcherRegex, mentionTooltipMap } = useMemo(() => {
    const tooltipMap = new Map<string, string>();
    const knownTokens = new Set<string>();

    for (const cand of mentionDirectory) {
      const label = cand.displayName
        ? `${cand.displayName} (${cand.email})`
        : cand.email;
      knownTokens.add(cand.email);
      tooltipMap.set(cand.email.toLowerCase(), label);

      const localPart = cand.email.split('@')[0];
      if (localPart) {
        knownTokens.add(localPart);
        if (!tooltipMap.has(localPart.toLowerCase())) {
          tooltipMap.set(localPart.toLowerCase(), label);
        }
      }

      if (cand.displayName) {
        knownTokens.add(cand.displayName);
        tooltipMap.set(cand.displayName.toLowerCase(), label);
      }
    }

    const sortedKnownPatterns = Array.from(knownTokens)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);

    // Match known project @DisplayName / @email / @localPart first, plus generic @handle
    const genericHandle = '[A-Za-zÀ-ÿ0-9._-]+(?:@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})?';
    const combinedAlternation =
      sortedKnownPatterns.length > 0
        ? `(?:${sortedKnownPatterns.join('|')}|${genericHandle})`
        : genericHandle;

    const regex = new RegExp(
      `(^|[\\s([{"'«¡¿,;:])(@${combinedAlternation})(?=$|[\\s)\\]}"'».,;:!?])`,
      'gi',
    );

    return { mentionMatcherRegex: regex, mentionTooltipMap: tooltipMap };
  }, [mentionDirectory]);

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
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    title: string;
    vp?: BcfViewpoint;
    vpGuid?: string;
  } | null>(null);

  // Comments composer state & @mention autocomplete
  const [commentText, setCommentText] = useState('');
  const [attachViewToComment, setAttachViewToComment] = useState(false);
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionTrigger, setMentionTrigger] = useState<{
    atIndex: number;
    cursorIndex: number;
    query: string;
  } | null>(null);
  const [mentionActiveIdx, setMentionActiveIdx] = useState(0);

  const filteredMentionCandidates = useMemo(() => {
    if (!mentionTrigger) return [];
    const q = mentionTrigger.query.trim().toLowerCase();
    return mentionDirectory
      .filter((cand) => {
        if (!q) return true;
        return (
          cand.email.toLowerCase().includes(q) ||
          (cand.displayName?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 8);
  }, [mentionDirectory, mentionTrigger]);

  const updateMentionTriggerFromTextarea = (
    value: string,
    selectionStart: number | null,
  ) => {
    if (selectionStart === null || mentionDirectory.length === 0) {
      setMentionTrigger(null);
      return;
    }
    const before = value.slice(0, selectionStart);
    const match = /(?:^|[\s([{"'«¡¿,;:])@([^\n@]{0,40})$/.exec(before);
    if (!match) {
      setMentionTrigger(null);
      return;
    }
    const query = match[1] ?? '';
    const atIndex = selectionStart - query.length - 1;
    setMentionTrigger({
      atIndex,
      cursorIndex: selectionStart,
      query,
    });
    setMentionActiveIdx(0);
  };

  const applyMentionCandidate = (candidate: MentionCandidate) => {
    if (!mentionTrigger) return;
    const prefix = commentText.slice(0, mentionTrigger.atIndex);
    const suffix = commentText.slice(mentionTrigger.cursorIndex);
    const inserted = `@${candidate.mentionToken} `;
    const nextValue = `${prefix}${inserted}${suffix}`;
    const nextCursorPos = prefix.length + inserted.length;

    setCommentText(nextValue);
    setMentionTrigger(null);

    window.requestAnimationFrame(() => {
      const el = commentTextareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursorPos, nextCursorPos);
      }
    });
  };

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
        try {
          await bcfService.createViewpoint(
            projectId,
            created.guid,
            initialVpPayload,
          );
        } catch (vpErr) {
          console.warn(
            '[TopicDetailPanel] Topic created, but initial viewpoint failed:',
            vpErr,
          );
          window.alert(
            `El tópico ${created.server_assigned_id || ''} se creó, pero falló al subir la captura inicial: ${getApiErrorMessage(vpErr)}`,
          );
        }
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
      setMentionTrigger(null);
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
    if (!isEngineReady || !topicGuid) return;
    setErrorMsg(null);
    setActiveAppliedVpGuid(vp.guid);
    try {
      const fullVp = await bcfService
        .getViewpoint(projectId, topicGuid, vp.guid)
        .catch(() => vp);
      await applyBcfViewpoint(fullVp);
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
                {translateTopicType(t)}
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
                {translateTopicStatus(s)}
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
                {translateTopicPriority(p)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-asphalt-200 mb-1">
            Fase
          </label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1.5 text-asphalt-50 focus:border-pavasal-500 focus:outline-none"
          >
            <option value="">Sin especificar</option>
            {stages.map((st) => (
              <option key={st} value={st}>
                {translateTopicStage(st)}
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
            Disciplinas
          </label>
          <div className="flex flex-wrap gap-1">
            {availableLabels.map((lbl) => {
              const selected = selectedLabels.includes(lbl);
              return (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => toggleLabel(lbl)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors ${selected
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
            Nuevo Tópico
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
              : 'Crear Tópico'}
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
              Editar metadatos ({topic.server_assigned_id || 'Tópico'})
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
                  {translateTopicType(topic.topic_type)}
                </span>
                {topic.priority && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] ${prioInfo.textClass}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${prioInfo.dotClass}`}
                    />
                    {translateTopicPriority(topic.priority)}
                  </span>
                )}
                {topic.stage && (
                  <span className="rounded bg-asphalt-800 px-1.5 py-0.5 text-[10px] text-asphalt-300">
                    {translateTopicStage(topic.stage)}
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
              {renderRichTextWithLinksAndMentions(
                topic.description,
                mentionMatcherRegex,
                mentionTooltipMap,
              )}
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
                value={
                  topicStatuses.includes(topic.topic_status)
                    ? topic.topic_status
                    : defaultStatus
                }
                disabled={quickStatusMutation.isPending}
                onChange={(e) => quickStatusMutation.mutate(e.target.value)}
                aria-label="Cambiar estado del tópico"
                className="rounded border border-asphalt-700 bg-asphalt-950 px-2 py-1 text-[11px] font-semibold text-asphalt-100 focus:border-pavasal-500 focus:outline-none"
              >
                {topicStatuses.map((s) => (
                  <option key={s} value={s}>
                    {translateTopicStatus(s)}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeStyle(topic.topic_status)}`}
              >
                {translateTopicStatus(topic.topic_status)}
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
                  className={`group relative rounded border overflow-hidden transition-colors ${isApplied
                    ? 'border-pavasal-500 ring-1 ring-pavasal-500/50 bg-asphalt-900'
                    : 'border-asphalt-700 bg-asphalt-950 hover:border-pavasal-500/70'
                    }`}
                >
                  <button
                    type="button"
                    disabled={!imgSrc}
                    onClick={() => {
                      if (!imgSrc) return;
                      setPreviewImage({
                        src: imgSrc,
                        title: `${topic.server_assigned_id || 'Tópico'} · Vista #${idx + 1}`,
                        vp,
                      });
                    }}
                    className="relative block w-full text-left group/vpimg focus:outline-none disabled:cursor-default"
                    title={imgSrc ? 'Ver imagen ampliada' : 'Sin captura disponible'}
                  >
                    <AuthenticatedImage
                      src={imgSrc}
                      alt={`Punto de vista ${idx + 1}`}
                      className="w-full h-24 object-cover"
                    />
                    {imgSrc && (
                      <span className="pointer-events-none absolute inset-0 bg-black/45 opacity-0 group-hover/vpimg:opacity-100 transition-opacity flex items-center justify-center gap-1 text-[10px] font-semibold text-white">
                        <ExpandImageIcon className="w-3.5 h-3.5 text-pavasal-400" />
                        <span>Ver imagen</span>
                      </span>
                    )}
                  </button>

                  <div className="p-1.5 bg-asphalt-900 flex items-center justify-between gap-1.5 border-t border-asphalt-800">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-asphalt-100 truncate">
                        Vista #{idx + 1}
                      </div>
                      {(selCount > 0 || clipCount > 0 || colorCount > 0) && (
                        <div className="flex flex-wrap gap-1 text-[9px] text-asphalt-400">
                          {selCount > 0 && <span>{selCount} sel.</span>}
                          {clipCount > 0 && <span>{clipCount} cortes</span>}
                          {colorCount > 0 && <span>{colorCount} col.</span>}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={!isEngineReady}
                      onClick={() => void handleApplyViewpoint(vp)}
                      title="Ir al punto de vista en el visor 3D"
                      aria-label={`Ir al punto de vista Vista #${idx + 1} en 3D`}
                      className={`shrink-0 rounded border p-1 transition-colors disabled:opacity-40 ${
                        isApplied
                          ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950'
                          : 'border-pavasal-500/40 bg-pavasal-500/15 text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950'
                      }`}
                    >
                      <GoToViewpointIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>

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

      {/* 3. Comments Thread (CommentsThread) */}
      <section className="space-y-2 pt-2 border-t border-asphalt-800">
        <h5 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
          Comentarios ({comments.length})
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
                          disabled={deleteCommentMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                '¿Estás seguro de que quieres eliminar este comentario?',
                              )
                            ) {
                              deleteCommentMutation.mutate(c.guid);
                            }
                          }}
                          className="text-red-400 hover:text-red-300 disabled:opacity-40"
                          title="Eliminar comentario"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {c.comment && (
                    <p className="text-asphalt-100 whitespace-pre-wrap leading-relaxed break-words select-text">
                      {renderRichTextWithLinksAndMentions(
                        c.comment,
                        mentionMatcherRegex,
                        mentionTooltipMap,
                      )}
                    </p>
                  )}

                  {c.viewpoint_guid && commentThumbSrc && (
                    <div className="w-full max-w-[230px] rounded border border-asphalt-700 bg-asphalt-950 overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewImage({
                            src: commentThumbSrc,
                            title: `${topic.server_assigned_id || 'Tópico'} · Captura del comentario`,
                            vp: associatedVp,
                            vpGuid: c.viewpoint_guid ?? undefined,
                          })
                        }
                        className="relative block w-full text-left group/cthumb focus:outline-none"
                        title="Ver imagen ampliada"
                      >
                        <AuthenticatedImage
                          src={commentThumbSrc}
                          alt="Vista adjunta al comentario"
                          className="w-full h-24 object-cover"
                        />
                        <span className="pointer-events-none absolute inset-0 bg-black/45 opacity-0 group-hover/cthumb:opacity-100 transition-opacity flex items-center justify-center gap-1 text-[10px] font-semibold text-white">
                          <ExpandImageIcon className="w-3.5 h-3.5 text-pavasal-400" />
                          <span>Ver imagen</span>
                        </span>
                      </button>
                      <div className="px-2 py-1 flex items-center justify-between gap-2 border-t border-asphalt-800 bg-asphalt-900">
                        <span className="text-[10px] text-asphalt-300 truncate">
                          Vista adjunta
                        </span>
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
                          title="Ir al punto de vista en el visor 3D"
                          aria-label="Ir al punto de vista adjunto al comentario en 3D"
                          className="shrink-0 rounded border border-pavasal-500/40 bg-pavasal-500/15 p-1 text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950 disabled:opacity-40 transition-colors"
                        >
                          <GoToViewpointIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
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
            className="space-y-1.5 pt-1 relative"
          >
            {/* @mention Autocomplete Menu */}
            {mentionTrigger && filteredMentionCandidates.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 z-30 rounded-md border border-asphalt-700 bg-asphalt-950 shadow-2xl overflow-hidden">
                <div className="px-2.5 py-1 border-b border-asphalt-800 text-[10px] font-semibold uppercase tracking-wider text-pavasal-400">
                  Mencionar usuario del proyecto
                </div>
                <div className="max-h-44 overflow-y-auto py-0.5">
                  {filteredMentionCandidates.map((cand, idx) => {
                    const isHighlighted = idx === mentionActiveIdx;
                    return (
                      <button
                        key={cand.email}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyMentionCandidate(cand);
                        }}
                        onMouseEnter={() => setMentionActiveIdx(idx)}
                        className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2 transition-colors ${isHighlighted
                          ? 'bg-pavasal-500/20 text-pavasal-300'
                          : 'text-asphalt-100 hover:bg-asphalt-800'
                          }`}
                      >
                        {cand.photoURL ? (
                          <img
                            src={cand.photoURL}
                            alt={cand.displayName || cand.email}
                            referrerPolicy="no-referrer"
                            className="w-5 h-5 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/40 text-[9px] font-bold text-sky-300 flex items-center justify-center shrink-0">
                            {getInitials(cand.displayName || cand.email)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium truncate">
                            {cand.displayName || cand.email}
                          </div>
                          {cand.displayName && (
                            <div className="text-[10px] text-asphalt-400 truncate">
                              {cand.email}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <textarea
              ref={commentTextareaRef}
              rows={2}
              value={commentText}
              onChange={(e) => {
                const val = e.target.value;
                setCommentText(val);
                updateMentionTriggerFromTextarea(val, e.target.selectionStart);
              }}
              onClick={(e) =>
                updateMentionTriggerFromTextarea(
                  e.currentTarget.value,
                  e.currentTarget.selectionStart,
                )
              }
              onKeyDown={(e) => {
                if (mentionTrigger && filteredMentionCandidates.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionActiveIdx(
                      (prev) => (prev + 1) % filteredMentionCandidates.length,
                    );
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionActiveIdx(
                      (prev) =>
                        (prev - 1 + filteredMentionCandidates.length) %
                        filteredMentionCandidates.length,
                    );
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    applyMentionCandidate(
                      filteredMentionCandidates[mentionActiveIdx] ??
                      filteredMentionCandidates[0],
                    );
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setMentionTrigger(null);
                    return;
                  }
                }
              }}
              onBlur={() => {
                window.setTimeout(() => setMentionTrigger(null), 150);
              }}
              placeholder="Escribe un comentario, menciona con @ o pega un enlace..."
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

      <ViewpointImageModal
        isOpen={Boolean(previewImage)}
        src={previewImage?.src ?? null}
        title={previewImage?.title ?? 'Captura del punto de vista'}
        canNavigate3D={isEngineReady}
        onNavigate3D={
          previewImage && (previewImage.vp || previewImage.vpGuid)
            ? () => {
                const targetVp = previewImage.vp;
                const targetGuid = previewImage.vpGuid;
                if (targetVp) {
                  void handleApplyViewpoint(targetVp);
                } else if (targetGuid) {
                  void bcfService
                    .getViewpoint(projectId, topic.guid, targetGuid)
                    .then((vp) => handleApplyViewpoint(vp))
                    .catch(() => {});
                }
              }
            : undefined
        }
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};

export default TopicDetailPanel;
