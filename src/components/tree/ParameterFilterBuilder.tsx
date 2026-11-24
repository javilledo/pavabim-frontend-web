import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  areConditionListsEqual,
  createEmptyFilterCondition,
  isConditionReady,
  OPERATOR_OPTIONS,
  operatorIsMultiValue,
  operatorNeedsValue,
  parseMultiValueList,
  valuesEqual,
  type FilterCondition,
  type ParameterDefinition,
  type ParameterFilterOperator,
} from '../../utils/elementParameterFilter';

interface ParameterFilterBuilderProps {
  parameters: ParameterDefinition[];
  isIndexing: boolean;
  draftConditions: FilterCondition[];
  appliedConditions: FilterCondition[];
  onChangeDraft: (next: FilterCondition[]) => void;
  onApply: (validConditions: FilterCondition[]) => void;
  onClear: () => void;
}

interface PopoverCoords {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

function computePopoverCoords(
  anchorEl: HTMLElement,
  minWidth: number,
  preferredMaxHeight = 280,
): PopoverCoords {
  const rect = anchorEl.getBoundingClientRect();
  const width = Math.min(
    Math.max(rect.width, minWidth),
    window.innerWidth - 16,
  );
  const left = Math.min(
    Math.max(8, rect.left),
    Math.max(8, window.innerWidth - width - 8),
  );
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const spaceAbove = rect.top - 12;

  if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
    return {
      left,
      top: rect.bottom + 4,
      width,
      maxHeight: Math.min(preferredMaxHeight, Math.max(140, spaceBelow)),
    };
  }

  const maxHeight = Math.min(preferredMaxHeight, Math.max(140, spaceAbove));
  return {
    left,
    top: Math.max(8, rect.top - maxHeight - 4),
    width,
    maxHeight,
  };
}

export const ParameterFilterBuilder: React.FC<ParameterFilterBuilderProps> = ({
  parameters,
  isIndexing,
  draftConditions,
  appliedConditions,
  onChangeDraft,
  onApply,
  onClear,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Parameter dropdown popover state
  const [openParamRowId, setOpenParamRowId] = useState<string | null>(null);
  const [paramSearch, setParamSearch] = useState('');
  const [paramCoords, setParamCoords] = useState<PopoverCoords | null>(null);
  const paramPopoverRef = useRef<HTMLDivElement | null>(null);
  const paramTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Value suggestions popover state
  const [openValueRowId, setOpenValueRowId] = useState<string | null>(null);
  const [valueSearch, setValueSearch] = useState('');
  const [valueCoords, setValueCoords] = useState<PopoverCoords | null>(null);
  const valuePopoverRef = useRef<HTMLDivElement | null>(null);
  const valueAnchorRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const parameterByKey = useMemo(() => {
    const map = new Map<string, ParameterDefinition>();
    for (const p of parameters) {
      map.set(p.key, p);
    }
    return map;
  }, [parameters]);

  const groupedParameters = useMemo(() => {
    const term = paramSearch.trim().toLowerCase();
    const groups = new Map<string, ParameterDefinition[]>();

    for (const param of parameters) {
      if (
        term &&
        !param.name.toLowerCase().includes(term) &&
        !param.group.toLowerCase().includes(term)
      ) {
        continue;
      }
      const list = groups.get(param.group);
      if (list) {
        list.push(param);
      } else {
        groups.set(param.group, [param]);
      }
    }

    return Array.from(groups.entries());
  }, [paramSearch, parameters]);

  // Close Parameter Popover on outside click / Escape / resize
  useEffect(() => {
    if (!openParamRowId) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (paramPopoverRef.current?.contains(target)) return;
      const trigger = paramTriggerRefs.current.get(openParamRowId);
      if (trigger?.contains(target)) return;
      setOpenParamRowId(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenParamRowId(null);
      }
    };

    const handleScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && paramPopoverRef.current?.contains(target)) return;
      setOpenParamRowId(null);
    };

    const handleResize = () => setOpenParamRowId(null);

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [openParamRowId]);

  // Close Value Suggestions Popover on outside click / Escape / resize
  useEffect(() => {
    if (!openValueRowId) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (valuePopoverRef.current?.contains(target)) return;
      const anchor = valueAnchorRefs.current.get(openValueRowId);
      if (anchor?.contains(target)) return;
      setOpenValueRowId(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenValueRowId(null);
      }
    };

    const handleScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && valuePopoverRef.current?.contains(target)) return;
      setOpenValueRowId(null);
    };

    const handleResize = () => setOpenValueRowId(null);

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [openValueRowId]);

  const readyDraftConditions = useMemo(
    () => draftConditions.filter(isConditionReady),
    [draftConditions],
  );

  const hasPendingChanges = useMemo(
    () => !areConditionListsEqual(readyDraftConditions, appliedConditions),
    [appliedConditions, readyDraftConditions],
  );

  const hasAnyInput = useMemo(
    () =>
      appliedConditions.length > 0 ||
      draftConditions.length > 1 ||
      draftConditions.some(
        (c) => Boolean(c.parameterKey) || c.value.trim().length > 0,
      ),
    [appliedConditions.length, draftConditions],
  );

  const updateCondition = (
    id: string,
    patch: Partial<Omit<FilterCondition, 'id'>>,
  ) => {
    onChangeDraft(
      draftConditions.map((cond) =>
        cond.id === id ? { ...cond, ...patch } : cond,
      ),
    );
  };

  const handleRemoveCondition = (id: string) => {
    if (openParamRowId === id) setOpenParamRowId(null);
    if (openValueRowId === id) setOpenValueRowId(null);
    if (draftConditions.length <= 1) {
      onChangeDraft([createEmptyFilterCondition()]);
      return;
    }
    onChangeDraft(draftConditions.filter((c) => c.id !== id));
  };

  const handleAddCondition = () => {
    onChangeDraft([...draftConditions, createEmptyFilterCondition()]);
  };

  const toggleParamDropdown = (rowId: string) => {
    if (openParamRowId === rowId) {
      setOpenParamRowId(null);
      return;
    }
    const trigger = paramTriggerRefs.current.get(rowId);
    if (!trigger) return;
    setOpenValueRowId(null);
    setParamSearch('');
    setParamCoords(computePopoverCoords(trigger, 280, 320));
    setOpenParamRowId(rowId);
  };

  const toggleValueDropdown = (rowId: string) => {
    if (openValueRowId === rowId) {
      setOpenValueRowId(null);
      return;
    }
    const anchor = valueAnchorRefs.current.get(rowId);
    if (!anchor) return;
    setOpenParamRowId(null);
    setValueSearch('');
    setValueCoords(computePopoverCoords(anchor, 240, 260));
    setOpenValueRowId(rowId);
  };

  const activeValueCondition = openValueRowId
    ? draftConditions.find((c) => c.id === openValueRowId) ?? null
    : null;
  const activeValueParam = activeValueCondition
    ? parameterByKey.get(activeValueCondition.parameterKey) ?? null
    : null;

  const filteredDistinctValues = useMemo(() => {
    if (!activeValueParam) return [];
    const term = valueSearch.trim().toLowerCase();
    const list = term
      ? activeValueParam.distinctValues.filter((v) =>
          v.toLowerCase().includes(term),
        )
      : activeValueParam.distinctValues;
    return list.slice(0, 200);
  }, [activeValueParam, valueSearch]);

  const handleToggleMultiSuggestion = (
    cond: FilterCondition,
    suggestedVal: string,
  ) => {
    const currentList = parseMultiValueList(cond.value);
    const existingIdx = currentList.findIndex((item) =>
      valuesEqual(item, suggestedVal),
    );
    let nextList: string[];
    if (existingIdx >= 0) {
      nextList = currentList.filter((_, idx) => idx !== existingIdx);
    } else {
      nextList = [...currentList, suggestedVal];
    }
    updateCondition(cond.id, { value: nextList.join(', ') });
  };

  return (
    <div className="rounded-md border border-asphalt-700 bg-asphalt-900/70 overflow-hidden">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full px-2.5 py-2 flex items-center justify-between gap-2 text-left hover:bg-asphalt-800/70 transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <svg
            className="w-3.5 h-3.5 text-pavasal-400 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 3h12L9.5 8.3v4.2l-3 1.5V8.3L2 3Z" />
          </svg>
          <span className="text-[11px] font-semibold text-asphalt-100 truncate">
            Filtrar por parámetro
          </span>
          {appliedConditions.length > 0 && (
            <span className="rounded-full bg-pavasal-500 px-1.5 py-0.5 text-[10px] font-bold text-asphalt-950 shrink-0">
              {appliedConditions.length}
            </span>
          )}
        </div>

        <span className="text-[11px] text-asphalt-400 shrink-0">
          {isExpanded ? '▾' : '▸'}
        </span>
      </button>

      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-1.5 border-t border-asphalt-800 space-y-2">
          {isIndexing && (
            <div className="flex items-center gap-1.5 rounded border border-asphalt-800 bg-asphalt-950/70 px-2 py-1.5 text-[10px] text-pavasal-400">
              <span className="inline-block w-2 h-2 rounded-full bg-pavasal-400 animate-pulse shrink-0" />
              <span>Extrayendo parámetros de los modelos visibles...</span>
            </div>
          )}

          {/* Cumulative Condition Rows */}
          <div className="space-y-2">
            {draftConditions.map((cond, idx) => {
              const selectedParam = parameterByKey.get(cond.parameterKey);
              const needsVal = operatorNeedsValue(cond.operator);
              const isMulti = operatorIsMultiValue(cond.operator);
              const hasSuggestions =
                Boolean(selectedParam) &&
                (selectedParam?.distinctValues.length ?? 0) > 0;

              return (
                <div key={cond.id} className="space-y-1.5">
                  {idx > 0 && (
                    <div className="flex items-center gap-1.5 px-1">
                      <div className="h-px flex-1 bg-asphalt-800" />
                      <span className="rounded bg-asphalt-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-pavasal-400">
                        Y (acumulativo)
                      </span>
                      <div className="h-px flex-1 bg-asphalt-800" />
                    </div>
                  )}

                  <div className="rounded border border-asphalt-700/90 bg-asphalt-950/75 p-2 space-y-1.5">
                    {/* Parameter Selector + Remove Row Button */}
                    <div className="flex items-start gap-1.5">
                      <button
                        ref={(el) => {
                          if (el) {
                            paramTriggerRefs.current.set(cond.id, el);
                          } else {
                            paramTriggerRefs.current.delete(cond.id);
                          }
                        }}
                        type="button"
                        disabled={isIndexing && parameters.length === 0}
                        onClick={() => toggleParamDropdown(cond.id)}
                        className="flex-1 min-w-0 rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1 text-left hover:border-pavasal-500/70 focus:border-pavasal-500 focus:outline-none disabled:opacity-50 transition-colors"
                        title={
                          selectedParam
                            ? `${selectedParam.group} · ${selectedParam.name}`
                            : 'Seleccionar parámetro IFC o Property Set'
                        }
                      >
                        {selectedParam ? (
                          <div className="flex items-center justify-between gap-1 min-w-0">
                            <div className="min-w-0 flex-1">
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-pavasal-400 truncate">
                                {selectedParam.group}
                              </div>
                              <div className="text-[11px] font-medium text-asphalt-100 truncate">
                                {selectedParam.name}
                              </div>
                            </div>
                            <span className="text-[10px] text-asphalt-400 shrink-0">
                              ▾
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1 py-0.5 text-[11px] text-asphalt-400">
                            <span className="truncate">
                              {isIndexing
                                ? 'Cargando parámetros...'
                                : 'Seleccionar parámetro...'}
                            </span>
                            <span className="text-[10px] shrink-0">▾</span>
                          </div>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveCondition(cond.id)}
                        className="p-1 rounded border border-asphalt-800 bg-asphalt-900 text-asphalt-400 hover:border-red-500/50 hover:text-red-400 transition-colors shrink-0"
                        title={
                          draftConditions.length > 1
                            ? 'Eliminar esta condición'
                            : 'Limpiar esta condición'
                        }
                        aria-label="Eliminar condición"
                      >
                        <svg
                          className="w-3 h-3"
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

                    {/* Operator Selector */}
                    <select
                      value={cond.operator}
                      onChange={(e) => {
                        const nextOp = e.target
                          .value as ParameterFilterOperator;
                        updateCondition(cond.id, { operator: nextOp });
                        if (!operatorNeedsValue(nextOp) && openValueRowId === cond.id) {
                          setOpenValueRowId(null);
                        }
                      }}
                      aria-label="Condición de filtrado"
                      className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1 text-[11px] text-asphalt-100 focus:border-pavasal-500 focus:outline-none"
                    >
                      {OPERATOR_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    {/* Value Input + Existing Values Dropdown */}
                    {needsVal && (
                      <div
                        ref={(el) => {
                          if (el) {
                            valueAnchorRefs.current.set(cond.id, el);
                          } else {
                            valueAnchorRefs.current.delete(cond.id);
                          }
                        }}
                        className="flex items-stretch rounded border border-asphalt-700 bg-asphalt-900 focus-within:border-pavasal-500"
                      >
                        <input
                          type="text"
                          value={cond.value}
                          onChange={(e) =>
                            updateCondition(cond.id, { value: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (
                              e.key === 'Enter' &&
                              readyDraftConditions.length > 0 &&
                              !isIndexing
                            ) {
                              e.preventDefault();
                              onApply(readyDraftConditions);
                            }
                          }}
                          placeholder={
                            isMulti
                              ? 'Separados por comas (ej: HA-25, HA-30)'
                              : 'Escribe o elige un valor...'
                          }
                          className="flex-1 min-w-0 bg-transparent px-2 py-1 text-[11px] text-asphalt-100 placeholder-asphalt-500 focus:outline-none"
                        />

                        {hasSuggestions && (
                          <button
                            type="button"
                            onClick={() => toggleValueDropdown(cond.id)}
                            className="px-1.5 border-l border-asphalt-700 text-asphalt-300 hover:bg-asphalt-800 hover:text-pavasal-400 transition-colors text-[10px] shrink-0"
                            title={
                              isMulti
                                ? 'Seleccionar uno o varios valores existentes'
                                : 'Elegir entre los valores existentes en el modelo'
                            }
                            aria-label="Ver valores existentes"
                          >
                            ▾
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Condition Button */}
          <button
            type="button"
            onClick={handleAddCondition}
            disabled={isIndexing && parameters.length === 0}
            className="w-full rounded border border-dashed border-asphalt-700 bg-asphalt-950/40 py-1 text-[11px] font-medium text-pavasal-400 hover:border-pavasal-500/60 hover:bg-asphalt-800/60 transition-colors disabled:opacity-40"
          >
            + Añadir condición
          </button>

          {/* Apply & Clear Actions */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              disabled={isIndexing || readyDraftConditions.length === 0}
              onClick={() => onApply(readyDraftConditions)}
              className="flex-1 rounded bg-pavasal-500 px-2.5 py-1.5 text-[11px] font-bold text-asphalt-950 hover:bg-pavasal-400 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Aplicar filtro</span>
              {hasPendingChanges && readyDraftConditions.length > 0 && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-asphalt-950"
                  title="Hay cambios pendientes de aplicar"
                />
              )}
            </button>

            <button
              type="button"
              disabled={!hasAnyInput}
              onClick={onClear}
              className="rounded border border-asphalt-700 bg-asphalt-800 px-2.5 py-1.5 text-[11px] font-medium text-asphalt-200 hover:border-pavasal-500/50 hover:text-white disabled:opacity-40 transition-colors"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}

      {/* Fixed Popover: Searchable Parameter List Grouped by Property Set */}
      {openParamRowId && paramCoords && (
        <div
          ref={paramPopoverRef}
          style={{
            left: paramCoords.left,
            top: paramCoords.top,
            width: paramCoords.width,
            maxHeight: paramCoords.maxHeight,
          }}
          className="fixed z-50 rounded-md border border-asphalt-700 bg-asphalt-900 shadow-2xl flex flex-col overflow-hidden text-xs"
        >
          <div className="p-2 border-b border-asphalt-800 bg-asphalt-950">
            <input
              type="search"
              autoFocus
              value={paramSearch}
              onChange={(e) => setParamSearch(e.target.value)}
              placeholder="Buscar parámetro o Property Set..."
              className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1 text-[11px] text-asphalt-100 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
            />
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-asphalt-800/70">
            {groupedParameters.length === 0 ? (
              <div className="p-3 text-center text-[11px] text-asphalt-400">
                No se encontraron parámetros coincidentes.
              </div>
            ) : (
              groupedParameters.map(([groupName, groupParams]) => (
                <div key={groupName}>
                  <div className="sticky top-0 bg-asphalt-950/95 backdrop-blur px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-pavasal-400 border-b border-asphalt-800/80">
                    {groupName}
                  </div>
                  <div className="py-0.5">
                    {groupParams.map((param) => {
                      const currentRow = draftConditions.find(
                        (c) => c.id === openParamRowId,
                      );
                      const isSelected = currentRow?.parameterKey === param.key;

                      return (
                        <button
                          key={param.key}
                          type="button"
                          onClick={() => {
                            updateCondition(openParamRowId, {
                              parameterKey: param.key,
                            });
                            setOpenParamRowId(null);
                          }}
                          className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 transition-colors ${
                            isSelected
                              ? 'bg-pavasal-500/20 text-pavasal-300 font-semibold'
                              : 'text-asphalt-100 hover:bg-asphalt-800'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] truncate">
                              {param.name}
                            </div>
                            <div className="text-[9px] text-asphalt-400 truncate">
                              {param.group}
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-asphalt-400 shrink-0">
                            {param.elementCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Fixed Popover: Existing Parameter Values Suggestions */}
      {openValueRowId &&
        valueCoords &&
        activeValueCondition &&
        activeValueParam && (
          <div
            ref={valuePopoverRef}
            style={{
              left: valueCoords.left,
              top: valueCoords.top,
              width: valueCoords.width,
              maxHeight: valueCoords.maxHeight,
            }}
            className="fixed z-50 rounded-md border border-asphalt-700 bg-asphalt-900 shadow-2xl flex flex-col overflow-hidden text-xs"
          >
            {activeValueParam.distinctValues.length > 6 && (
              <div className="p-2 border-b border-asphalt-800 bg-asphalt-950">
                <input
                  type="search"
                  autoFocus
                  value={valueSearch}
                  onChange={(e) => setValueSearch(e.target.value)}
                  placeholder="Filtrar valores existentes..."
                  className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1 text-[11px] text-asphalt-100 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
                />
              </div>
            )}

            <div className="overflow-y-auto flex-1 py-1">
              {filteredDistinctValues.length === 0 ? (
                <div className="p-2.5 text-center text-[11px] text-asphalt-400">
                  Sin valores coincidentes.
                </div>
              ) : (
                filteredDistinctValues.map((val) => {
                  const isMulti = operatorIsMultiValue(
                    activeValueCondition.operator,
                  );
                  const currentTokens = isMulti
                    ? parseMultiValueList(activeValueCondition.value)
                    : [];
                  const isChecked = isMulti
                    ? currentTokens.some((t) => valuesEqual(t, val))
                    : valuesEqual(activeValueCondition.value, val);

                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        if (isMulti) {
                          handleToggleMultiSuggestion(
                            activeValueCondition,
                            val,
                          );
                        } else {
                          updateCondition(activeValueCondition.id, {
                            value: val,
                          });
                          setOpenValueRowId(null);
                        }
                      }}
                      className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2 text-[11px] transition-colors ${
                        isChecked
                          ? 'bg-pavasal-500/20 text-pavasal-300 font-medium'
                          : 'text-asphalt-100 hover:bg-asphalt-800'
                      }`}
                    >
                      {isMulti && (
                        <span
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] shrink-0 ${
                            isChecked
                              ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950 font-bold'
                              : 'border-asphalt-600 bg-asphalt-950'
                          }`}
                        >
                          {isChecked ? '✓' : ''}
                        </span>
                      )}
                      <span className="truncate">{val}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
    </div>
  );
};

export default ParameterFilterBuilder;
