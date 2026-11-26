import React, { useEffect, useMemo, useState } from 'react';
import { useViewerStore } from '../../store/useViewerStore';
import {
  extractInspectorPropertyGroups,
  isVariosMarker,
  STRUCTURED_GROUPS_KEY,
  type InspectorPropertyGroup,
} from '../../utils/elementParameterFilter';
import { useEngine } from '../../viewer/EngineContext';
import { ColorByParameterControls } from '../viewer/ColorByParameterControls';
import { SelectionAppearanceControls } from '../viewer/SelectionAppearanceControls';

const renderPropertyValue = (val: unknown): React.ReactNode => {
  if (isVariosMarker(val)) {
    return (
      <span className="italic font-normal text-asphalt-300">
        &lt;varios&gt;
      </span>
    );
  }
  if (val === null || val === undefined) return '—';
  const str = String(val).trim();
  return str.length > 0 ? str : '—';
};

export const PropertiesInspector: React.FC = () => {
  const {
    loadedModels,
    selectedElementId,
    selectedModelId,
    selectedElementProperties,
    selectedElementsMap,
  } = useViewerStore();
  const { clearSelection, focusElement, focusSelectionMap } = useEngine();

  const [propertyFilterText, setPropertyFilterText] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  // Reset collapsed state only when selection is cleared completely
  useEffect(() => {
    if (!selectedElementId) {
      setCollapsedGroups(new Set());
      setPropertyFilterText('');
    }
  }, [selectedElementId]);

  const rawGroups = useMemo<InspectorPropertyGroup[]>(() => {
    if (!selectedElementProperties) return [];
    const structured = (selectedElementProperties as Record<string, unknown>)[
      STRUCTURED_GROUPS_KEY
    ];
    if (Array.isArray(structured)) {
      return structured as InspectorPropertyGroup[];
    }
    return extractInspectorPropertyGroups(selectedElementProperties).groups;
  }, [selectedElementProperties]);

  const filteredGroups = useMemo(() => {
    const term = propertyFilterText.trim().toLowerCase();
    if (!term) return rawGroups;

    const result: InspectorPropertyGroup[] = [];
    for (const grp of rawGroups) {
      if (grp.name.toLowerCase().includes(term)) {
        result.push(grp);
        continue;
      }
      const matchingEntries = grp.entries.filter((entry) => {
        if (entry.key.toLowerCase().includes(term)) return true;
        if (!isVariosMarker(entry.value)) {
          return String(entry.value).toLowerCase().includes(term);
        }
        return false;
      });
      if (matchingEntries.length > 0) {
        result.push({
          ...grp,
          entries: matchingEntries,
        });
      }
    }
    return result;
  }, [propertyFilterText, rawGroups]);

  if (!selectedElementId) {
    return (
      <div className="space-y-4 text-xs">
        <ColorByParameterControls />

        <div className="text-center text-xs text-asphalt-300 mt-6 px-4">
          <p className="font-semibold text-asphalt-100">Inspector de Elementos</p>
          <p className="mt-1.5 text-asphalt-400 leading-relaxed">
            Haz clic en cualquier elemento 3D o selecciona un elemento en la
            pestaña Elementos para consultar sus propiedades IFC.
          </p>
        </div>
      </div>
    );
  }

  const modelNameById = new Map(loadedModels.map((m) => [m.id, m.name]));
  const selectedModelName = selectedModelId
    ? modelNameById.get(selectedModelId) ?? selectedModelId
    : null;
  const selectedModelNames = Object.entries(selectedElementsMap)
    .filter(([, ids]) => ids.length > 0)
    .map(([modelId, ids]) => ({
      modelId,
      name: modelNameById.get(modelId) ?? modelId,
      count: ids.length,
    }));

  const allSelectedIds = Object.values(selectedElementsMap).flat();
  const totalSelectedCount = allSelectedIds.length;
  const isMultiSelection = totalSelectedCount > 1;
  const hasSingleCommonLocalId = new Set(allSelectedIds).size <= 1;

  const isLoadingProperties = selectedElementProperties === null;
  const totalPropertiesCount = rawGroups.reduce(
    (sum, g) => sum + g.entries.length,
    0,
  );

  const toggleGroupCollapsed = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const allCollapsed =
    filteredGroups.length > 0 &&
    filteredGroups.every((g) => collapsedGroups.has(g.name));

  const toggleAllGroups = () => {
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(filteredGroups.map((g) => g.name)));
    }
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Header Badge */}
      <div className="bg-asphalt-800/80 border border-asphalt-700 border-l-2 border-l-pavasal-500 rounded-md p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
            {isMultiSelection
              ? `Elementos seleccionados (${totalSelectedCount})`
              : 'Elemento seleccionado'}
          </span>
          <div className="flex items-center space-x-2">
            {selectedModelId && (
              <button
                type="button"
                onClick={() =>
                  isMultiSelection
                    ? void focusSelectionMap(selectedElementsMap, true)
                    : void focusElement(
                        selectedModelId,
                        Number(selectedElementId),
                      )
                }
                className="text-[11px] text-pavasal-400 hover:text-pavasal-300 font-medium transition-colors"
                title={
                  isMultiSelection
                    ? 'Enfocar cámara en los elementos seleccionados'
                    : 'Enfocar cámara en el elemento'
                }
              >
                Enfocar
              </button>
            )}
            <button
              type="button"
              onClick={clearSelection}
              className="text-[11px] text-asphalt-300 hover:text-white transition-colors"
              title="Limpiar selección"
            >
              Limpiar
            </button>
          </div>
        </div>
        <div className="mt-2 font-mono text-sm text-white select-text">
          Local ID:{' '}
          {hasSingleCommonLocalId ? (
            `#${selectedElementId}`
          ) : (
            <span className="italic font-sans font-normal text-asphalt-300">
              &lt;varios&gt;
            </span>
          )}
        </div>
        {selectedModelId && selectedModelName && (
          <div
            className="mt-1.5 flex items-center gap-1.5 text-[11px] min-w-0"
            title={
              selectedModelNames.length > 1
                ? selectedModelNames
                    .map((entry) => `${entry.name} (${entry.count})`)
                    .join(', ')
                : selectedModelName !== selectedModelId
                  ? `${selectedModelName} (${selectedModelId})`
                  : selectedModelId
            }
          >
            <span className="text-asphalt-400 shrink-0">Modelo:</span>
            {selectedModelNames.length > 1 ? (
              <span className="italic font-normal text-asphalt-300 truncate">
                &lt;varios&gt;
              </span>
            ) : (
              <span className="font-medium text-asphalt-100 truncate">
                {selectedModelName}
              </span>
            )}
          </div>
        )}
        {selectedModelNames.length > 1 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {selectedModelNames.map((entry) => (
              <span
                key={entry.modelId}
                className="inline-flex items-center gap-1 rounded bg-asphalt-900/90 border border-asphalt-700 px-1.5 py-0.5 text-[10px] text-asphalt-200 max-w-full"
                title={`${entry.name} (${entry.count})`}
              >
                <span className="truncate">{entry.name}</span>
                <span className="font-mono text-asphalt-400 shrink-0">
                  ({entry.count})
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Selected Elements Appearance */}
      <div className="bg-asphalt-950/50 border border-asphalt-700 rounded-md p-2.5">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
          Apariencia de selección
        </div>
        <SelectionAppearanceControls compact />
      </div>

      {/* Assign Color By Parameter (All Shown Elements) */}
      <ColorByParameterControls />

      {/* Properties Search & Summary Header */}
      {isLoadingProperties ? (
        <div className="rounded-md border border-asphalt-800 bg-asphalt-950/50 p-4 text-center text-asphalt-400">
          Cargando Property Sets y atributos...
        </div>
      ) : rawGroups.length === 0 ? (
        <div className="text-center text-asphalt-400 py-4">
          Este elemento no contiene propiedades IFC embebidas.
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 px-0.5 text-[10px] text-asphalt-400">
              <span>
                {rawGroups.length}{' '}
                {rawGroups.length === 1 ? 'grupo' : 'Property Sets'} ·{' '}
                {totalPropertiesCount}{' '}
                {totalPropertiesCount === 1 ? 'propiedad' : 'propiedades'}
              </span>
              {filteredGroups.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAllGroups}
                  className="text-pavasal-400 hover:text-pavasal-300 font-medium transition-colors"
                >
                  {allCollapsed ? 'Expandir todo' : 'Contraer todo'}
                </button>
              )}
            </div>

            {totalPropertiesCount > 6 && (
              <input
                type="search"
                value={propertyFilterText}
                onChange={(e) => setPropertyFilterText(e.target.value)}
                placeholder="Buscar propiedad o Property Set..."
                className="w-full rounded border border-asphalt-700 bg-asphalt-950 px-2.5 py-1.5 text-[11px] text-asphalt-100 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
              />
            )}
          </div>

          {filteredGroups.length === 0 ? (
            <div className="rounded border border-asphalt-800 bg-asphalt-950/50 p-3 text-center text-[11px] text-asphalt-400">
              No hay propiedades ni Property Sets que coincidan con la búsqueda.
            </div>
          ) : (
            filteredGroups.map((group) => {
              const isCollapsed =
                !propertyFilterText.trim() && collapsedGroups.has(group.name);

              return (
                <div
                  key={group.name}
                  className="bg-asphalt-950/50 border border-asphalt-700 rounded-md overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapsed(group.name)}
                    className="w-full px-3 py-2 bg-asphalt-950 hover:bg-asphalt-900/90 border-b border-asphalt-800 flex items-center justify-between gap-2 text-left transition-colors"
                    title={group.name}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-[11px] text-asphalt-400 shrink-0">
                        {isCollapsed ? '▸' : '▾'}
                      </span>
                      <span
                        className={`truncate text-[11px] font-semibold ${
                          group.isAttributesGroup
                            ? 'uppercase tracking-wider text-pavasal-400'
                            : 'text-pavasal-400'
                        }`}
                      >
                        {group.name}
                      </span>
                    </div>
                    <span className="rounded-full bg-asphalt-800 px-1.5 py-0.5 text-[10px] font-mono text-asphalt-300 shrink-0">
                      {group.entries.length}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="divide-y divide-asphalt-800">
                      {group.entries.map(({ key, value }) => (
                        <div
                          key={key}
                          className="px-3 py-1.5 flex items-start justify-between gap-3"
                        >
                          <span
                            className="text-asphalt-400 text-[11px] break-words min-w-0 flex-1 select-text"
                            title={key}
                          >
                            {key}
                          </span>
                          <span className="text-asphalt-100 font-medium text-[11px] text-right break-all max-w-[58%] select-text">
                            {renderPropertyValue(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default PropertiesInspector;
