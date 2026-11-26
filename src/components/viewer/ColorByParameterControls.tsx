import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useViewerStore } from '../../store/useViewerStore';
import type { ColorParameterGroup } from '../../utils/colorByParameter';
import type { ParameterDefinition } from '../../utils/elementParameterFilter';
import { useEngine } from '../../viewer/EngineContext';

interface PopoverCoords {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

function computePopoverCoords(
  anchorEl: HTMLElement,
  minWidth: number,
  preferredMaxHeight = 320,
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

export const ColorByParameterControls: React.FC = () => {
  const {
    loadedModels,
    selectedElementsMap,
    colorByParameterKey,
    colorByParameterCustomColors,
    colorByParameterAvailableParams,
    colorByParameterGroups,
    isColorByParameterIndexing,
    setColorByParameterKey,
    setColorByParameterGroupColor,
    resetColorByParameterColors,
  } = useViewerStore();

  const {
    isEngineReady,
    focusSelectionMap,
    toggleSelectionMap,
    clearSelection,
  } = useEngine();

  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);
  const [isParamOpen, setIsParamOpen] = useState(false);
  const [paramSearch, setParamSearch] = useState('');
  const [paramCoords, setParamCoords] = useState<PopoverCoords | null>(null);
  const [valueFilterText, setValueFilterText] = useState('');

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const visibleModelsCount = useMemo(
    () => loadedModels.filter((m) => m.visible).length,
    [loadedModels],
  );

  const parameterByKey = useMemo(() => {
    const map = new Map<string, ParameterDefinition>();
    for (const p of colorByParameterAvailableParams) {
      map.set(p.key, p);
    }
    return map;
  }, [colorByParameterAvailableParams]);

  const selectedParam = colorByParameterKey
    ? parameterByKey.get(colorByParameterKey) ?? null
    : null;

  useEffect(() => {
    setValueFilterText('');
    if (colorByParameterKey) {
      setIsLegendCollapsed(false);
    }
  }, [colorByParameterKey]);

  const groupedParameters = useMemo(() => {
    const term = paramSearch.trim().toLowerCase();
    const groups = new Map<string, ParameterDefinition[]>();

    for (const param of colorByParameterAvailableParams) {
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
  }, [colorByParameterAvailableParams, paramSearch]);

  useEffect(() => {
    if (!isParamOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setIsParamOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsParamOpen(false);
      }
    };

    const handleScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && popoverRef.current?.contains(target)) return;
      setIsParamOpen(false);
    };

    const handleResize = () => setIsParamOpen(false);

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
  }, [isParamOpen]);

  const selectedKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const [modelId, ids] of Object.entries(selectedElementsMap)) {
      for (const id of ids) {
        set.add(`${modelId}:${id}`);
      }
    }
    return set;
  }, [selectedElementsMap]);

  const filteredGroups = useMemo(() => {
    const term = valueFilterText.trim().toLowerCase();
    if (!term) return colorByParameterGroups;
    return colorByParameterGroups.filter((g) =>
      g.label.toLowerCase().includes(term),
    );
  }, [colorByParameterGroups, valueFilterText]);

  const totalShownElements = useMemo(
    () => colorByParameterGroups.reduce((acc, g) => acc + g.totalCount, 0),
    [colorByParameterGroups],
  );

  const hasCustomPaletteOverrides = Boolean(
    colorByParameterKey &&
      colorByParameterCustomColors[colorByParameterKey] &&
      Object.keys(colorByParameterCustomColors[colorByParameterKey]).length > 0,
  );

  const toggleDropdown = () => {
    if (isParamOpen) {
      setIsParamOpen(false);
      return;
    }
    if (!triggerRef.current) return;
    setParamSearch('');
    setParamCoords(computePopoverCoords(triggerRef.current, 272, 340));
    setIsParamOpen(true);
  };

  const getGroupSelectionState = (group: ColorParameterGroup) => {
    if (selectedKeySet.size === 0 || group.totalCount === 0) {
      return { allSelected: false, exclusivelySelected: false };
    }
    let matched = 0;
    for (const [modelId, ids] of Object.entries(group.selectionByModel)) {
      for (const id of ids) {
        if (selectedKeySet.has(`${modelId}:${id}`)) {
          matched += 1;
        } else {
          return { allSelected: false, exclusivelySelected: false };
        }
      }
    }
    const allSelected = matched === group.totalCount;
    const exclusivelySelected =
      allSelected && selectedKeySet.size === group.totalCount;
    return { allSelected, exclusivelySelected };
  };

  const handleSelectGroup = (
    e: React.MouseEvent<HTMLButtonElement>,
    group: ColorParameterGroup,
    exclusivelySelected: boolean,
  ) => {
    if (e.ctrlKey || e.metaKey) {
      void toggleSelectionMap(group.selectionByModel, false);
      return;
    }
    if (exclusivelySelected) {
      void clearSelection();
      return;
    }
    void focusSelectionMap(group.selectionByModel, false);
  };

  const isDisabled =
    !isEngineReady ||
    visibleModelsCount === 0 ||
    (isColorByParameterIndexing && colorByParameterAvailableParams.length === 0);

  return (
    <div className="bg-asphalt-950/50 border border-asphalt-700 rounded-md p-2.5 text-xs space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
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
            <path d="M8 2a6 6 0 1 0 0 12h1.2a1.8 1.8 0 0 0 1.4-2.9l-.3-.4a1.5 1.5 0 0 1 1.2-2.4H13A1 1 0 0 0 14 7.3 6 6 0 0 0 8 2Z" />
            <circle cx="5.2" cy="6.6" r="0.8" fill="currentColor" stroke="none" />
            <circle cx="8" cy="5.2" r="0.8" fill="currentColor" stroke="none" />
            <circle cx="10.8" cy="6.6" r="0.8" fill="currentColor" stroke="none" />
            <circle cx="5.6" cy="9.8" r="0.8" fill="currentColor" stroke="none" />
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400 truncate">
            Asignar color según parámetro
          </span>
          {colorByParameterKey && colorByParameterGroups.length > 0 && (
            <span
              className="rounded-full bg-pavasal-500 px-1.5 py-0.5 text-[10px] font-bold text-asphalt-950 shrink-0"
              title={`${colorByParameterGroups.length} valores distintos`}
            >
              {colorByParameterGroups.length}
            </span>
          )}
        </div>

        {colorByParameterKey && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setColorByParameterKey(null)}
              className="text-[10px] font-medium text-pavasal-400 hover:text-pavasal-300 transition-colors"
              title="Desactivar coloreado por parámetro y restaurar colores originales"
            >
              Restablecer
            </button>
            <button
              type="button"
              onClick={() => setIsLegendCollapsed((prev) => !prev)}
              className="px-1 text-[11px] text-asphalt-400 hover:text-asphalt-100 transition-colors"
              title={
                isLegendCollapsed
                  ? 'Mostrar leyenda de valores y colores'
                  : 'Contraer leyenda de valores y colores'
              }
              aria-label="Alternar leyenda de valores"
            >
              {isLegendCollapsed ? '▸' : '▾'}
            </button>
          </div>
        )}
      </div>

      {/* Indexing status */}
      {isColorByParameterIndexing && (
        <div className="flex items-center gap-1.5 rounded border border-asphalt-800 bg-asphalt-900/70 px-2 py-1 text-[10px] text-pavasal-400">
          <span className="inline-block w-2 h-2 rounded-full bg-pavasal-400 animate-pulse shrink-0" />
          <span>Analizando parámetros de elementos en pantalla...</span>
        </div>
      )}

      {/* Parameter Selector Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        onClick={toggleDropdown}
        className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2.5 py-1.5 text-left hover:border-pavasal-500/70 focus:border-pavasal-500 focus:outline-none disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
        title={
          selectedParam
            ? `${selectedParam.group} · ${selectedParam.name}`
            : visibleModelsCount === 0
              ? 'Carga y muestra al menos un modelo para colorear por parámetro'
              : 'Seleccionar parámetro de los elementos mostrados'
        }
      >
        {selectedParam ? (
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-pavasal-400 truncate">
                  {selectedParam.group}
                </span>
                {selectedParam.isNumeric && (
                  <span
                    className="rounded bg-pavasal-500/15 px-1 py-px text-[8px] font-mono font-bold text-pavasal-400 shrink-0"
                    title="Parámetro numérico (redondeado a 3 decimales)"
                  >
                    123
                  </span>
                )}
              </div>
              <div className="text-[11px] font-medium text-asphalt-100 truncate">
                {selectedParam.name}
              </div>
            </div>
            <span className="text-[10px] text-asphalt-400 shrink-0">▾</span>
          </div>
        ) : colorByParameterKey ? (
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[11px] font-medium text-asphalt-100 truncate">
              {colorByParameterKey.replace(/^(?:attr|pset)::/, '')}
            </span>
            <span className="text-[10px] text-asphalt-400 shrink-0">▾</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-[11px] text-asphalt-400">
            <span className="truncate">
              {visibleModelsCount === 0
                ? 'Sin modelos visibles en pantalla'
                : isColorByParameterIndexing
                  ? 'Cargando parámetros...'
                  : 'Seleccionar parámetro...'}
            </span>
            <span className="text-[10px] shrink-0">▾</span>
          </div>
        )}
      </button>

      {/* Active Parameter Legend & Interactive Group Selector */}
      {colorByParameterKey && !isLegendCollapsed && (
        <div className="space-y-1.5 pt-1 border-t border-asphalt-800">
          <div className="flex items-center justify-between gap-2 px-0.5 text-[10px] text-asphalt-400">
            <span>
              {colorByParameterGroups.length}{' '}
              {colorByParameterGroups.length === 1 ? 'valor' : 'valores'} ·{' '}
              {totalShownElements}{' '}
              {totalShownElements === 1 ? 'elemento' : 'elementos'}
            </span>
            {hasCustomPaletteOverrides && (
              <button
                type="button"
                onClick={() => resetColorByParameterColors(colorByParameterKey)}
                className="text-pavasal-400 hover:text-pavasal-300 font-medium transition-colors"
                title="Volver a los colores automáticos para este parámetro"
              >
                Colores automáticos
              </button>
            )}
          </div>

          {colorByParameterGroups.length > 6 && (
            <input
              type="search"
              value={valueFilterText}
              onChange={(e) => setValueFilterText(e.target.value)}
              placeholder="Filtrar valores..."
              className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1 text-[11px] text-asphalt-100 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
            />
          )}

          {filteredGroups.length === 0 ? (
            <div className="rounded border border-asphalt-800 bg-asphalt-900/50 p-2 text-center text-[11px] text-asphalt-400">
              {colorByParameterGroups.length === 0
                ? 'No hay elementos visibles en pantalla.'
                : 'Ningún valor coincide con el filtro.'}
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5">
              {filteredGroups.map((group) => {
                const { allSelected, exclusivelySelected } =
                  getGroupSelectionState(group);

                return (
                  <div
                    key={group.valueKey}
                    className={`group flex items-center gap-1.5 rounded border px-1.5 py-1 transition-colors ${
                      allSelected
                        ? 'border-pavasal-500 bg-pavasal-500/15'
                        : group.isUndefined
                          ? 'border-red-500/35 bg-red-950/20 hover:border-red-500/60 hover:bg-asphalt-800/80'
                          : 'border-asphalt-800 bg-asphalt-900/80 hover:border-asphalt-600 hover:bg-asphalt-800/80'
                    }`}
                  >
                    {/* Custom Color Picker Swatch */}
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="relative w-4 h-4 rounded border border-asphalt-500/80 hover:scale-110 hover:border-white transition-transform cursor-pointer shrink-0 overflow-hidden shadow-sm"
                      style={{ backgroundColor: group.color }}
                      title={`Cambiar color de "${group.label}" (${group.color})`}
                    >
                      <input
                        type="color"
                        value={group.color}
                        onChange={(e) =>
                          setColorByParameterGroupColor(
                            colorByParameterKey,
                            group.valueKey,
                            e.target.value,
                          )
                        }
                        aria-label={`Cambiar color de ${group.label}`}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </label>

                    {/* Clickable Value Label to Select Group Elements */}
                    <button
                      type="button"
                      onClick={(e) =>
                        handleSelectGroup(e, group, exclusivelySelected)
                      }
                      className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left"
                      title={`Clic para seleccionar los ${group.totalCount} elementos con "${group.label}" (Ctrl+clic para añadir/quitar)`}
                    >
                      <span
                        className={`text-[11px] truncate ${
                          allSelected
                            ? 'font-semibold text-pavasal-300'
                            : group.isUndefined
                              ? 'italic font-medium text-red-300'
                              : 'font-medium text-asphalt-100'
                        }`}
                      >
                        {group.label}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-mono shrink-0 ${
                          allSelected
                            ? 'bg-pavasal-500 text-asphalt-950 font-bold'
                            : 'bg-asphalt-800 text-asphalt-300'
                        }`}
                      >
                        {group.totalCount}
                      </span>
                    </button>

                    {/* Quick Camera Focus Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void focusSelectionMap(group.selectionByModel, true);
                      }}
                      className="p-0.5 rounded text-asphalt-400 hover:text-pavasal-400 hover:bg-asphalt-800 opacity-70 group-hover:opacity-100 transition-all shrink-0"
                      title={`Seleccionar y enfocar en cámara (${group.totalCount})`}
                      aria-label={`Enfocar elementos de ${group.label}`}
                    >
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="8" cy="8" r="4.5" />
                        <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
                        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Fixed Searchable Parameter Dropdown Popover */}
      {isParamOpen && paramCoords && (
        <div
          ref={popoverRef}
          style={{
            left: paramCoords.left,
            top: paramCoords.top,
            width: paramCoords.width,
            maxHeight: paramCoords.maxHeight,
          }}
          className="fixed z-50 rounded-md border border-asphalt-700 bg-asphalt-900 shadow-2xl flex flex-col overflow-hidden text-xs"
        >
          <div className="p-2 border-b border-asphalt-800 bg-asphalt-950 space-y-1.5">
            <input
              type="search"
              autoFocus
              value={paramSearch}
              onChange={(e) => setParamSearch(e.target.value)}
              placeholder="Buscar parámetro o Property Set..."
              className="w-full rounded border border-asphalt-700 bg-asphalt-900 px-2 py-1 text-[11px] text-asphalt-100 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
            />
            {colorByParameterKey && (
              <button
                type="button"
                onClick={() => {
                  setColorByParameterKey(null);
                  setIsParamOpen(false);
                }}
                className="w-full rounded border border-asphalt-700 bg-asphalt-800/80 px-2 py-1 text-[10px] font-medium text-asphalt-200 hover:border-pavasal-500/60 hover:text-pavasal-300 text-left transition-colors"
              >
                ✕ Quitar coloreado por parámetro (colores originales)
              </button>
            )}
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
                      const isSelected = colorByParameterKey === param.key;

                      return (
                        <button
                          key={param.key}
                          type="button"
                          onClick={() => {
                            setColorByParameterKey(param.key);
                            setIsParamOpen(false);
                          }}
                          className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 transition-colors ${
                            isSelected
                              ? 'bg-pavasal-500/20 text-pavasal-300 font-semibold'
                              : 'text-asphalt-100 hover:bg-asphalt-800'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[11px] truncate">
                                {param.name}
                              </span>
                              {param.isNumeric && (
                                <span
                                  className="rounded bg-pavasal-500/15 px-1 py-px text-[8px] font-mono font-bold text-pavasal-400 shrink-0"
                                  title="Parámetro numérico"
                                >
                                  123
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] text-asphalt-400 truncate">
                              {param.group}
                            </div>
                          </div>
                          <span
                            className="text-[10px] font-mono text-asphalt-400 shrink-0"
                            title={`${param.elementCount} elementos en pantalla con este parámetro`}
                          >
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
    </div>
  );
};

export default ColorByParameterControls;
