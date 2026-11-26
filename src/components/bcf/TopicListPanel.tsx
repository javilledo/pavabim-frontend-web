import React, { useMemo, useState } from 'react';
import { bcfService } from '../../api/bcf.service';
import type { ProjectMember } from '../../types/api.types';
import type {
  BcfProjectExtensions,
  BcfTopic,
} from '../../types/bcf.types';
import { AuthenticatedImage } from '../common/AuthenticatedImage';

export interface TopicListFilters {
  search: string;
  statuses: string[];
  topicType: string;
  assignedTo: string;
  label: string;
  orderBy: string;
}

interface TopicListPanelProps {
  projectId: string;
  topics: BcfTopic[];
  totalCount?: number;
  isLoading: boolean;
  errorMessage: string | null;
  canEditBcf: boolean;
  isEngineReady: boolean;
  extensions: BcfProjectExtensions | undefined;
  members: ProjectMember[];
  filters: TopicListFilters;
  onChangeFilters: (next: TopicListFilters) => void;
  onOpenCreate: () => void;
  onSelectTopic: (topicGuid: string) => void;
  onQuickApplyViewpoint: (topic: BcfTopic) => Promise<void>;
  onExportBcf: (selectedTopicGuids?: string[]) => Promise<void>;
}

export function getStatusBadgeStyle(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('open') || s.includes('abiert') || s.includes('reopen')) {
    return 'bg-amber-500/15 border-amber-500/50 text-amber-300';
  }
  if (s.includes('progress') || s.includes('curso') || s.includes('active')) {
    return 'bg-sky-500/15 border-sky-500/50 text-sky-300';
  }
  if (s.includes('resolv') || s.includes('resuel') || s.includes('done')) {
    return 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300';
  }
  if (s.includes('clos') || s.includes('cerrad')) {
    return 'bg-asphalt-800 border-asphalt-600 text-asphalt-300';
  }
  return 'bg-asphalt-900 border-asphalt-700 text-asphalt-200';
}

export function getPriorityIndicator(priority?: string): {
  dotClass: string;
  textClass: string;
} {
  const p = (priority || '').toLowerCase();
  if (p.includes('crit') || p.includes('urgent')) {
    return { dotClass: 'bg-red-500', textClass: 'text-red-300 font-bold' };
  }
  if (p.includes('high') || p.includes('alta')) {
    return { dotClass: 'bg-orange-500', textClass: 'text-orange-300 font-semibold' };
  }
  if (p.includes('low') || p.includes('baja')) {
    return { dotClass: 'bg-slate-400', textClass: 'text-asphalt-300' };
  }
  return { dotClass: 'bg-pavasal-400', textClass: 'text-pavasal-300 font-medium' };
}

export function getInitials(label: string): string {
  const clean = label.trim();
  if (!clean) return '?';
  const parts = clean.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function isDateOverdue(dueIso?: string, status?: string): boolean {
  if (!dueIso) return false;
  const s = (status || '').toLowerCase();
  if (s.includes('clos') || s.includes('resolv') || s.includes('cerrad')) {
    return false;
  }
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return false;
  const endOfDueDay = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate(),
    23,
    59,
    59,
  );
  return endOfDueDay.getTime() < Date.now();
}

function formatDueDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  });
}

export const TopicListPanel: React.FC<TopicListPanelProps> = ({
  projectId,
  topics,
  totalCount,
  isLoading,
  errorMessage,
  canEditBcf,
  isEngineReady,
  extensions,
  members,
  filters,
  onChangeFilters,
  onOpenCreate,
  onSelectTopic,
  onQuickApplyViewpoint,
  onExportBcf,
}) => {
  const [selectedGuids, setSelectedGuids] = useState<Set<string>>(new Set());
  const [applyingThumbGuid, setApplyingThumbGuid] = useState<string | null>(
    null,
  );
  const [isExporting, setIsExporting] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const memberByEmail = useMemo(() => {
    const map = new Map<string, ProjectMember>();
    for (const m of members) {
      map.set(m.email.toLowerCase(), m);
    }
    return map;
  }, [members]);

  const assignableUsers = useMemo(() => {
    const emails = new Set<string>();
    for (const email of extensions?.user_id_type ?? []) {
      if (email?.trim()) emails.add(email.trim());
    }
    for (const m of members) {
      if (m.email?.trim()) emails.add(m.email.trim());
    }
    return Array.from(emails).sort((a, b) => a.localeCompare(b));
  }, [extensions?.user_id_type, members]);

  const statuses = extensions?.topic_status ?? [];
  const types = extensions?.topic_type ?? [];
  const labels = extensions?.topic_label ?? [];

  const hasActiveFilters = Boolean(
    filters.search.trim() ||
      filters.statuses.length > 0 ||
      filters.topicType ||
      filters.assignedTo ||
      filters.label,
  );

  const validSelectedGuids = useMemo(() => {
    const visibleSet = new Set(topics.map((t) => t.guid));
    return Array.from(selectedGuids).filter((g) => visibleSet.has(g));
  }, [selectedGuids, topics]);

  const toggleStatusFilter = (status: string) => {
    const exists = filters.statuses.includes(status);
    const nextStatuses = exists
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChangeFilters({ ...filters, statuses: nextStatuses });
  };

  const toggleTopicChecked = (guid: string) => {
    setSelectedGuids((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) {
        next.delete(guid);
      } else {
        next.add(guid);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (validSelectedGuids.length === topics.length && topics.length > 0) {
      setSelectedGuids(new Set());
    } else {
      setSelectedGuids(new Set(topics.map((t) => t.guid)));
    }
  };

  const handleExportClick = async () => {
    setIsExporting(true);
    try {
      if (validSelectedGuids.length > 0) {
        await onExportBcf(validSelectedGuids);
      } else if (hasActiveFilters && topics.length > 0) {
        await onExportBcf(topics.map((t) => t.guid));
      } else {
        await onExportBcf(undefined);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleThumbClick = async (
    e: React.MouseEvent,
    topic: BcfTopic,
  ) => {
    e.stopPropagation();
    if (!isEngineReady || applyingThumbGuid) return;
    setApplyingThumbGuid(topic.guid);
    try {
      await onQuickApplyViewpoint(topic);
    } finally {
      setApplyingThumbGuid(null);
    }
  };

  return (
    <div className="space-y-2.5 text-xs">
      {/* Header Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400 truncate">
            Tópicos BCF 3.0
          </h3>
          <span className="rounded-full bg-asphalt-800 border border-asphalt-700 px-1.5 py-0.5 text-[10px] font-mono text-asphalt-200 shrink-0">
            {totalCount ?? topics.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={isExporting || (topics.length === 0 && !hasActiveFilters)}
            onClick={() => void handleExportClick()}
            className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1 text-[10px] font-semibold text-asphalt-100 hover:border-pavasal-500/60 hover:text-pavasal-300 disabled:opacity-40 transition-colors"
            title={
              validSelectedGuids.length > 0
                ? `Exportar ${validSelectedGuids.length} tópicos seleccionados a archivo .bcf`
                : hasActiveFilters
                  ? `Exportar los ${topics.length} tópicos filtrados a archivo .bcf`
                  : 'Exportar todos los tópicos del proyecto a archivo .bcf (BCF 3.0)'
            }
          >
            {isExporting
              ? 'Exportando...'
              : validSelectedGuids.length > 0
                ? `Exportar BCF (${validSelectedGuids.length})`
                : 'Exportar BCF 3.0'}
          </button>

          {canEditBcf && (
            <button
              type="button"
              onClick={onOpenCreate}
              className="rounded bg-pavasal-500 px-2.5 py-1 text-[11px] font-bold text-asphalt-950 hover:bg-pavasal-400 transition-colors"
            >
              + Nuevo Tópico
            </button>
          )}
        </div>
      </div>

      {/* Search Bar & Filter Toggle */}
      <div className="flex items-center gap-1.5">
        <input
          type="search"
          value={filters.search}
          onChange={(e) =>
            onChangeFilters({ ...filters, search: e.target.value })
          }
          placeholder="Buscar por título o ID (ej. TOP-001)..."
          className="flex-1 min-w-0 rounded border border-asphalt-700 bg-asphalt-900 px-2.5 py-1.5 text-[11px] text-asphalt-100 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShowAdvancedFilters((prev) => !prev)}
          className={`px-2 py-1.5 rounded border text-[11px] font-medium transition-colors shrink-0 ${
            showAdvancedFilters ||
            filters.topicType ||
            filters.assignedTo ||
            filters.label
              ? 'border-pavasal-500/70 bg-pavasal-500/15 text-pavasal-400'
              : 'border-asphalt-700 bg-asphalt-900 text-asphalt-300 hover:text-asphalt-100'
          }`}
          title="Filtros por tipo, usuario asignado, disciplina y orden"
        >
          Filtros ▾
        </button>
      </div>

      {/* Status Quick Filter Pills */}
      {statuses.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onChangeFilters({ ...filters, statuses: [] })}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors ${
              filters.statuses.length === 0
                ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950 font-bold'
                : 'border-asphalt-700 bg-asphalt-900 text-asphalt-300 hover:border-asphalt-500'
            }`}
          >
            Todos
          </button>
          {statuses.map((st) => {
            const active = filters.statuses.includes(st);
            return (
              <button
                key={st}
                type="button"
                onClick={() => toggleStatusFilter(st)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                  active
                    ? 'border-pavasal-500 bg-pavasal-500/20 text-pavasal-300 font-semibold'
                    : 'border-asphalt-700 bg-asphalt-900/80 text-asphalt-300 hover:border-asphalt-500'
                }`}
              >
                {st}
              </button>
            );
          })}
        </div>
      )}

      {/* Collapsible Dropdown Filters (Type, Assignee, Label/Discipline, Sort) */}
      {showAdvancedFilters && (
        <div className="rounded border border-asphalt-700 bg-asphalt-950/70 p-2 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="block text-[10px] text-asphalt-400 mb-0.5">
                Tipo
              </label>
              <select
                value={filters.topicType}
                onChange={(e) =>
                  onChangeFilters({ ...filters, topicType: e.target.value })
                }
                className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-1.5 py-1 text-[11px] text-asphalt-100 focus:border-pavasal-500 focus:outline-none"
              >
                <option value="">Todos los tipos</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-asphalt-400 mb-0.5">
                Disciplina / Etiqueta
              </label>
              <select
                value={filters.label}
                onChange={(e) =>
                  onChangeFilters({ ...filters, label: e.target.value })
                }
                className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-1.5 py-1 text-[11px] text-asphalt-100 focus:border-pavasal-500 focus:outline-none"
              >
                <option value="">Todas</option>
                {labels.map((lbl) => (
                  <option key={lbl} value={lbl}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="block text-[10px] text-asphalt-400 mb-0.5">
                Asignado a
              </label>
              <select
                value={filters.assignedTo}
                onChange={(e) =>
                  onChangeFilters({ ...filters, assignedTo: e.target.value })
                }
                className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-1.5 py-1 text-[11px] text-asphalt-100 focus:border-pavasal-500 focus:outline-none"
              >
                <option value="">Cualquier usuario</option>
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
              <label className="block text-[10px] text-asphalt-400 mb-0.5">
                Ordenar por
              </label>
              <select
                value={filters.orderBy}
                onChange={(e) =>
                  onChangeFilters({ ...filters, orderBy: e.target.value })
                }
                className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-1.5 py-1 text-[11px] text-asphalt-100 focus:border-pavasal-500 focus:outline-none"
              >
                <option value="modified_date desc">Recientes (modif.)</option>
                <option value="creation_date desc">Fecha creación</option>
                <option value="server_assigned_id asc">ID (TOP-001 ↑)</option>
                <option value="index asc">Índice ↑</option>
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  onChangeFilters({
                    search: '',
                    statuses: [],
                    topicType: '',
                    assignedTo: '',
                    label: '',
                    orderBy: filters.orderBy,
                  })
                }
                className="text-[10px] font-medium text-pavasal-400 hover:text-pavasal-300"
              >
                Limpiar filtros activos
              </button>
            </div>
          )}
        </div>
      )}

      {/* Batch Selection Helper Bar */}
      {topics.length > 0 && (
        <div className="flex items-center justify-between px-0.5 text-[10px] text-asphalt-400">
          <label className="inline-flex items-center gap-1.5 cursor-pointer hover:text-asphalt-200">
            <input
              type="checkbox"
              checked={
                topics.length > 0 && validSelectedGuids.length === topics.length
              }
              onChange={toggleSelectAllVisible}
              className="accent-pavasal-500 rounded"
            />
            <span>
              {validSelectedGuids.length > 0
                ? `${validSelectedGuids.length} seleccionados para exportar`
                : 'Seleccionar para exportar .bcf'}
            </span>
          </label>
          {validSelectedGuids.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedGuids(new Set())}
              className="text-pavasal-400 hover:text-pavasal-300"
            >
              Deseleccionar
            </button>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="rounded border border-red-700/70 bg-red-950/60 p-2 text-[11px] text-red-200">
          {errorMessage}
        </div>
      )}

      {/* Topics List */}
      {isLoading ? (
        <div className="py-6 text-center text-asphalt-400">
          Cargando tópicos del proyecto...
        </div>
      ) : topics.length === 0 ? (
        <div className="rounded border border-dashed border-asphalt-700 p-5 text-center text-asphalt-400 space-y-1">
          <p className="font-medium text-asphalt-200">
            No se encontraron tópicos
          </p>
          <p className="text-[11px]">
            {hasActiveFilters
              ? 'Prueba a ajustar o limpiar los filtros de búsqueda.'
              : 'Crea el primer tópico BCF 3.0 capturando la vista 3D actual.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {topics.map((topic) => {
            const thumbPath = bcfService.resolveTopicThumbnailPath(
              projectId,
              topic,
            );
            const isChecked = selectedGuids.has(topic.guid);
            const prio = getPriorityIndicator(topic.priority);
            const assigneeMember = topic.assigned_to
              ? memberByEmail.get(topic.assigned_to.toLowerCase())
              : undefined;
            const assigneeLabel =
              assigneeMember?.displayName || topic.assigned_to || '';
            const overdue = isDateOverdue(topic.due_date, topic.topic_status);
            const isApplyingThumb = applyingThumbGuid === topic.guid;

            return (
              <div
                key={topic.guid}
                onClick={() => onSelectTopic(topic.guid)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelectTopic(topic.guid);
                }}
                className={`group rounded-md border p-2 transition-colors cursor-pointer space-y-2 ${
                  isChecked
                    ? 'border-pavasal-500/80 bg-asphalt-800/90'
                    : 'border-asphalt-700 bg-asphalt-900/70 hover:bg-asphalt-800/80 hover:border-pavasal-500/60'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Export Checkbox */}
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleTopicChecked(topic.guid)}
                    aria-label={`Seleccionar ${topic.server_assigned_id || topic.title}`}
                    className="mt-1 accent-pavasal-500 shrink-0 cursor-pointer"
                  />

                  {/* Clickable Viewpoint Thumbnail (applies 3D viewpoint directly without opening detail) */}
                  {thumbPath && (
                    <button
                      type="button"
                      disabled={!isEngineReady || isApplyingThumb}
                      onClick={(e) => void handleThumbClick(e, topic)}
                      className="relative w-20 h-16 rounded border border-asphalt-700 overflow-hidden shrink-0 group/thumb hover:border-pavasal-400 focus:outline-none"
                      title="Clic en la miniatura para aplicar este punto de vista directamente en el visor 3D"
                    >
                      <AuthenticatedImage
                        src={thumbPath}
                        alt={topic.title}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute inset-0 bg-black/55 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-[9px] font-bold text-pavasal-400 px-1 text-center">
                        {isApplyingThumb ? 'Aplicando...' : 'Ir a vista 3D'}
                      </span>
                    </button>
                  )}

                  {/* Card Main Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="rounded bg-asphalt-950 border border-asphalt-700 px-1.5 py-0.5 font-mono text-[10px] font-bold text-pavasal-400 shrink-0">
                          {topic.server_assigned_id || topic.guid.slice(0, 8)}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${getStatusBadgeStyle(topic.topic_status)}`}
                        >
                          {topic.topic_status}
                        </span>
                      </div>

                      {topic.priority && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] shrink-0 ${prio.textClass}`}
                          title={`Prioridad: ${topic.priority}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${prio.dotClass}`}
                          />
                          {topic.priority}
                        </span>
                      )}
                    </div>

                    <h4 className="font-semibold text-asphalt-50 text-xs leading-snug line-clamp-2">
                      {topic.title}
                    </h4>

                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-asphalt-400">
                      <span className="rounded bg-asphalt-950/80 px-1.5 py-px text-asphalt-300">
                        {topic.topic_type}
                      </span>
                      {(topic.labels ?? []).slice(0, 2).map((lbl) => (
                        <span
                          key={lbl}
                          className="rounded bg-pavasal-500/10 border border-pavasal-500/30 px-1.5 py-px text-pavasal-400"
                        >
                          {lbl}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer: Assignee Avatar + Due Date + Counters */}
                <div className="pt-1.5 border-t border-asphalt-800 flex items-center justify-between gap-2 text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {assigneeLabel ? (
                      <>
                        {assigneeMember?.photoURL ? (
                          <img
                            src={assigneeMember.photoURL}
                            alt={assigneeLabel}
                            referrerPolicy="no-referrer"
                            className="w-4 h-4 rounded-full object-cover border border-asphalt-600 shrink-0"
                          />
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-pavasal-500/20 border border-pavasal-500/40 text-[9px] font-bold text-pavasal-300 flex items-center justify-center shrink-0">
                            {getInitials(assigneeLabel)}
                          </span>
                        )}
                        <span
                          className="text-asphalt-200 truncate"
                          title={topic.assigned_to}
                        >
                          {assigneeLabel}
                        </span>
                      </>
                    ) : (
                      <span className="text-asphalt-500 italic">
                        Sin asignar
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-asphalt-400">
                    {topic.due_date && (
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${
                          overdue
                            ? 'bg-red-950/70 border border-red-500/50 text-red-300'
                            : 'bg-asphalt-950 text-asphalt-300'
                        }`}
                        title={`Fecha límite: ${topic.due_date}`}
                      >
                        ⏰ {formatDueDate(topic.due_date)}
                      </span>
                    )}
                    {topic.viewpoints_count !== undefined && (
                      <span title="Puntos de vista">
                        📷 {topic.viewpoints_count}
                      </span>
                    )}
                    {topic.comments_count !== undefined && (
                      <span title="Comentarios">
                        💬 {topic.comments_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TopicListPanel;
