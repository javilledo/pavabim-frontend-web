import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bcfService } from '../../api/bcf.service';
import type { ProjectMember } from '../../types/api.types';
import type {
  BcfProjectExtensions,
  BcfTopic,
} from '../../types/bcf.types';
import {
  filterAllowedTopicStatuses,
  PAVABIM_DISCIPLINE_LABELS,
  translateTopicPriority,
  translateTopicStatus,
  translateTopicType,
} from '../../utils/bcfLabels';
import { AuthenticatedImage } from '../common/AuthenticatedImage';
import {
  ExpandImageIcon,
  GoToViewpointIcon,
  ViewpointImageModal,
} from './ViewpointImageModal';

export const UNASSIGNED_FILTER_VALUE = '__UNASSIGNED__';

export interface TopicListFilters {
  search: string;
  statuses: string[];
  topicType: string;
  assignedTos: string[];
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
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    title: string;
    topic: BcfTopic;
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);
  const assigneeDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isAssigneeMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        assigneeDropdownRef.current &&
        !assigneeDropdownRef.current.contains(e.target as Node)
      ) {
        setIsAssigneeMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAssigneeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAssigneeMenuOpen]);

  const memberByEmail = useMemo(() => {
    const map = new Map<string, ProjectMember>();
    for (const m of members) {
      map.set(m.email.toLowerCase(), m);
    }
    return map;
  }, [members]);

  const assignableUsers = useMemo(() => {
    const emailsByLower = new Map<string, string>();
    for (const m of members) {
      const clean = m.email?.trim();
      if (clean) emailsByLower.set(clean.toLowerCase(), clean);
    }
    for (const email of extensions?.user_id_type ?? []) {
      const clean = email?.trim();
      if (clean && !emailsByLower.has(clean.toLowerCase())) {
        emailsByLower.set(clean.toLowerCase(), clean);
      }
    }
    return Array.from(emailsByLower.values()).sort((a, b) => {
      const ma = memberByEmail.get(a.toLowerCase());
      const mb = memberByEmail.get(b.toLowerCase());
      const la = ma?.displayName || a;
      const lb = mb?.displayName || b;
      return la.localeCompare(lb, 'es', { sensitivity: 'base' });
    });
  }, [extensions?.user_id_type, memberByEmail, members]);

  const statuses = useMemo(
    () =>
      filterAllowedTopicStatuses(
        extensions?.topic_status?.length
          ? extensions.topic_status
          : ['Open', 'In Progress', 'Resolved', 'Closed'],
      ),
    [extensions?.topic_status],
  );
  const types = extensions?.topic_type ?? [];
  const labels = PAVABIM_DISCIPLINE_LABELS;

  const hasActiveFilters = Boolean(
    filters.search.trim() ||
      filters.statuses.length > 0 ||
      filters.topicType ||
      filters.assignedTos.length > 0 ||
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

  const toggleAssigneeFilter = (value: string) => {
    const lowerTarget = value.toLowerCase();
    const exists = filters.assignedTos.some(
      (item) => item.toLowerCase() === lowerTarget,
    );
    const nextAssignedTos = exists
      ? filters.assignedTos.filter((item) => item.toLowerCase() !== lowerTarget)
      : [...filters.assignedTos, value];
    onChangeFilters({ ...filters, assignedTos: nextAssignedTos });
  };

  const resolveAssigneeOptionLabel = (value: string): string => {
    if (value === UNASSIGNED_FILTER_VALUE) return 'Sin asignar';
    const member = memberByEmail.get(value.toLowerCase());
    return member?.displayName || value;
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
            Tópicos
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
                  : 'Exportar todos los tópicos del proyecto a archivo .bcf'
            }
          >
            {isExporting
              ? 'Exportando...'
              : validSelectedGuids.length > 0
                ? `Exportar BCF (${validSelectedGuids.length})`
                : 'Exportar BCF'}
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
            filters.label
              ? 'border-pavasal-500/70 bg-pavasal-500/15 text-pavasal-400'
              : 'border-asphalt-700 bg-asphalt-900 text-asphalt-300 hover:text-asphalt-100'
          }`}
          title="Filtros por tipo, disciplina y orden"
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
                {translateTopicStatus(st)}
              </button>
            );
          })}
        </div>
      )}

      {/* Top Multi-Select "Asignado a" Filter */}
      <div ref={assigneeDropdownRef} className="relative space-y-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsAssigneeMenuOpen((prev) => !prev)}
            className={`flex-1 min-w-0 flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-[11px] transition-colors ${
              filters.assignedTos.length > 0 || isAssigneeMenuOpen
                ? 'border-pavasal-500/70 bg-pavasal-500/10 text-asphalt-100'
                : 'border-asphalt-700 bg-asphalt-900 text-asphalt-200 hover:border-asphalt-500'
            }`}
            title="Filtrar tópicos por uno o varios usuarios asignados"
          >
            <span className="flex items-center gap-1.5 min-w-0 truncate">
              <svg
                className="w-3.5 h-3.5 shrink-0 text-pavasal-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="text-asphalt-400 shrink-0">Asignado a:</span>
              {filters.assignedTos.length === 0 ? (
                <span className="text-asphalt-300 truncate">
                  Todos los usuarios
                </span>
              ) : filters.assignedTos.length === 1 ? (
                <span className="font-semibold text-pavasal-300 truncate">
                  {resolveAssigneeOptionLabel(filters.assignedTos[0])}
                </span>
              ) : (
                <span className="font-semibold text-pavasal-300 truncate">
                  {filters.assignedTos.length} personas seleccionadas
                </span>
              )}
            </span>
            <span className="text-[10px] text-asphalt-400 shrink-0">
              {isAssigneeMenuOpen ? '▴' : '▾'}
            </span>
          </button>

          {filters.assignedTos.length > 0 && (
            <button
              type="button"
              onClick={() => onChangeFilters({ ...filters, assignedTos: [] })}
              title="Limpiar filtro de usuarios asignados"
              className="rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1.5 text-[10px] font-medium text-asphalt-300 hover:border-pavasal-500/60 hover:text-pavasal-300 transition-colors shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        {/* Active Assignee Pills */}
        {filters.assignedTos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {filters.assignedTos.map((val) => {
              const label = resolveAssigneeOptionLabel(val);
              const member =
                val !== UNASSIGNED_FILTER_VALUE
                  ? memberByEmail.get(val.toLowerCase())
                  : undefined;
              return (
                <span
                  key={val}
                  className="inline-flex items-center gap-1 rounded-full border border-pavasal-500/45 bg-pavasal-500/15 pl-1.5 pr-1 py-0.5 text-[10px] font-medium text-pavasal-300 max-w-full"
                >
                  {member?.photoURL ? (
                    <img
                      src={member.photoURL}
                      alt={label}
                      referrerPolicy="no-referrer"
                      className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                    />
                  ) : val !== UNASSIGNED_FILTER_VALUE ? (
                    <span className="w-3.5 h-3.5 rounded-full bg-pavasal-500/25 text-[8px] font-bold text-pavasal-200 flex items-center justify-center shrink-0">
                      {getInitials(label)}
                    </span>
                  ) : null}
                  <span className="truncate max-w-[140px]">{label}</span>
                  <button
                    type="button"
                    onClick={() => toggleAssigneeFilter(val)}
                    aria-label={`Quitar filtro ${label}`}
                    className="rounded-full px-1 text-pavasal-300 hover:bg-pavasal-500/30 hover:text-white leading-none"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Multi-Select Dropdown Popover */}
        {isAssigneeMenuOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-md border border-asphalt-700 bg-asphalt-950 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-asphalt-800 px-2.5 py-1.5 text-[10px]">
              <span className="font-semibold uppercase tracking-wider text-pavasal-400">
                Filtrar por asignado
              </span>
              {filters.assignedTos.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onChangeFilters({ ...filters, assignedTos: [] })
                  }
                  className="font-medium text-pavasal-400 hover:text-pavasal-300"
                >
                  Todos
                </button>
              )}
            </div>

            <div className="max-h-52 overflow-y-auto py-1 divide-y divide-asphalt-900">
              {/* Unassigned option */}
              <label className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-asphalt-800/80 transition-colors">
                <input
                  type="checkbox"
                  checked={filters.assignedTos.includes(UNASSIGNED_FILTER_VALUE)}
                  onChange={() => toggleAssigneeFilter(UNASSIGNED_FILTER_VALUE)}
                  className="accent-pavasal-500 rounded shrink-0"
                />
                <span className="w-5 h-5 rounded-full border border-dashed border-asphalt-600 text-[10px] text-asphalt-400 flex items-center justify-center shrink-0">
                  —
                </span>
                <span className="text-[11px] italic text-asphalt-300 truncate">
                  Sin asignar
                </span>
              </label>

              {assignableUsers.length === 0 ? (
                <div className="px-2.5 py-2 text-[11px] text-asphalt-400">
                  No hay usuarios en el proyecto.
                </div>
              ) : (
                assignableUsers.map((email) => {
                  const member = memberByEmail.get(email.toLowerCase());
                  const display = member?.displayName || email;
                  const checked = filters.assignedTos.some(
                    (item) => item.toLowerCase() === email.toLowerCase(),
                  );
                  return (
                    <label
                      key={email}
                      className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-asphalt-800/80 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAssigneeFilter(email)}
                        className="accent-pavasal-500 rounded shrink-0"
                      />
                      {member?.photoURL ? (
                        <img
                          src={member.photoURL}
                          alt={display}
                          referrerPolicy="no-referrer"
                          className="w-5 h-5 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-pavasal-500/20 border border-pavasal-500/40 text-[9px] font-bold text-pavasal-300 flex items-center justify-center shrink-0">
                          {getInitials(display)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium text-asphalt-100 truncate">
                          {display}
                        </div>
                        {member?.displayName && (
                          <div className="text-[10px] text-asphalt-400 truncate">
                            {email}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Dropdown Filters (Type, Label/Discipline, Sort) */}
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
                    {translateTopicType(t)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-asphalt-400 mb-0.5">
                Disciplinas
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

          {hasActiveFilters && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  onChangeFilters({
                    search: '',
                    statuses: [],
                    topicType: '',
                    assignedTos: [],
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
              : 'Crea el primer tópico capturando la vista 3D actual.'}
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
            const hasViewpoint = Boolean(
              thumbPath ||
                topic.default_viewpoint_guid ||
                (topic.viewpoints_count ?? 0) > 0,
            );

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

                  {/* Clickable Snapshot Thumbnail (opens full-size image modal) */}
                  {thumbPath && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewImage({
                          src: thumbPath,
                          title: `${topic.server_assigned_id || 'Tópico'} · ${topic.title}`,
                          topic,
                        });
                      }}
                      className="relative w-20 h-16 rounded border border-asphalt-700 overflow-hidden shrink-0 group/thumb hover:border-pavasal-400 focus:outline-none"
                      title="Ver imagen ampliada"
                    >
                      <AuthenticatedImage
                        src={thumbPath}
                        alt={topic.title}
                        className="w-full h-full object-cover"
                      />
                      <span className="pointer-events-none absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ExpandImageIcon className="w-4 h-4 text-pavasal-400" />
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
                          {translateTopicStatus(topic.topic_status)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {topic.priority && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] shrink-0 ${prio.textClass}`}
                            title={`Prioridad: ${translateTopicPriority(topic.priority)}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${prio.dotClass}`}
                            />
                            {translateTopicPriority(topic.priority)}
                          </span>
                        )}

                        {hasViewpoint && (
                          <button
                            type="button"
                            disabled={!isEngineReady || isApplyingThumb}
                            onClick={(e) => void handleThumbClick(e, topic)}
                            title={
                              isApplyingThumb
                                ? 'Aplicando punto de vista...'
                                : 'Ir al punto de vista en el visor 3D'
                            }
                            aria-label={`Ir al punto de vista de ${topic.server_assigned_id || topic.title} en 3D`}
                            className="rounded border border-pavasal-500/40 bg-pavasal-500/15 p-1 text-pavasal-400 hover:bg-pavasal-500 hover:text-asphalt-950 disabled:opacity-40 transition-colors"
                          >
                            <GoToViewpointIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <h4 className="font-semibold text-asphalt-50 text-xs leading-snug line-clamp-2">
                      {topic.title}
                    </h4>

                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-asphalt-400">
                      <span className="rounded bg-asphalt-950/80 px-1.5 py-px text-asphalt-300">
                        {translateTopicType(topic.topic_type)}
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

      <ViewpointImageModal
        isOpen={Boolean(previewImage)}
        src={previewImage?.src ?? null}
        title={previewImage?.title ?? 'Captura del tópico'}
        canNavigate3D={isEngineReady}
        onNavigate3D={
          previewImage
            ? () => {
                void onQuickApplyViewpoint(previewImage.topic);
              }
            : undefined
        }
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};

export default TopicListPanel;
