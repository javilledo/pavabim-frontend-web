import React from 'react';
import { useViewerStore } from '../../store/useViewerStore';
import { useEngine } from '../../viewer/EngineContext';

const formatValue = (val: unknown): string => {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
    const inner = (val as Record<string, unknown>).value;
    return inner !== null && inner !== undefined ? String(inner) : '—';
  }
  return String(val);
};

export const PropertiesInspector: React.FC = () => {
  const { selectedElementId, selectedModelId, selectedElementProperties } =
    useViewerStore();
  const { clearSelection, focusElement } = useEngine();

  if (!selectedElementId) {
    return (
      <div className="text-center text-xs text-asphalt-300 mt-8 px-4">
        <p className="font-semibold text-asphalt-100">Inspector de Elementos</p>
        <p className="mt-1.5 text-asphalt-400 leading-relaxed">
          Haz clic en cualquier elemento 3D o selecciona un nodo del Árbol
          Espacial para consultar sus propiedades IFC.
        </p>
      </div>
    );
  }

  const entries = selectedElementProperties
    ? Object.entries(selectedElementProperties)
    : [];
  const primitiveAttributes = entries.filter(([, val]) => !Array.isArray(val));
  const nestedGroups = entries.filter(([, val]) => Array.isArray(val));

  return (
    <div className="space-y-4 text-xs">
      {/* Header Badge */}
      <div className="bg-asphalt-800/80 border border-asphalt-700 border-l-2 border-l-pavasal-500 rounded-md p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
            Elemento seleccionado
          </span>
          <div className="flex items-center space-x-2">
            {selectedModelId && (
              <button
                onClick={() =>
                  focusElement(selectedModelId, Number(selectedElementId))
                }
                className="text-[11px] text-pavasal-400 hover:text-pavasal-300 font-medium transition-colors"
                title="Enfocar cámara en el elemento"
              >
                Enfocar
              </button>
            )}
            <button
              onClick={clearSelection}
              className="text-[11px] text-asphalt-300 hover:text-white transition-colors"
              title="Limpiar selección"
            >
              Limpiar
            </button>
          </div>
        </div>
        <div className="mt-2 font-mono text-sm text-white">
          Local ID: #{selectedElementId}
        </div>
        {selectedModelId && (
          <div
            className="mt-0.5 text-[11px] text-asphalt-400 truncate"
            title={selectedModelId}
          >
            Modelo: {selectedModelId}
          </div>
        )}
      </div>

      {/* Attributes */}
      {primitiveAttributes.length > 0 && (
        <div className="bg-asphalt-950/50 border border-asphalt-700 rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-asphalt-950 border-b border-asphalt-700 font-semibold text-pavasal-400 text-[11px] uppercase tracking-wider">
            Atributos principales
          </div>
          <div className="divide-y divide-asphalt-800">
            {primitiveAttributes.map(([key, val]) => (
              <div key={key} className="px-3 py-1.5 flex justify-between gap-2">
                <span className="text-asphalt-400 truncate" title={key}>
                  {key}
                </span>
                <span className="text-asphalt-100 font-medium text-right break-all">
                  {formatValue(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Property Sets / Relations */}
      {nestedGroups.map(([groupKey, items]) => (
        <div
          key={groupKey}
          className="bg-asphalt-950/50 border border-asphalt-700 rounded-md overflow-hidden"
        >
          <div className="px-3 py-2 bg-asphalt-950 border-b border-asphalt-700 font-semibold text-asphalt-200">
            {groupKey} ({(items as unknown[]).length})
          </div>
          <div className="divide-y divide-asphalt-800">
            {(items as Record<string, unknown>[]).map((item, idx) => {
              const name = item.Name ? formatValue(item.Name) : `Item ${idx + 1}`;
              return (
                <div key={`${groupKey}-${idx}`} className="p-2.5 space-y-1">
                  <div className="text-[11px] font-medium text-pavasal-400">
                    {name}
                  </div>
                  {Object.entries(item)
                    .filter(([k]) => k !== 'Name' && !Array.isArray(item[k]))
                    .map(([k, v]) => (
                      <div
                        key={k}
                        className="flex justify-between gap-2 text-[11px]"
                      >
                        <span className="text-asphalt-400 truncate">{k}</span>
                        <span className="text-asphalt-100 text-right break-all">
                          {formatValue(v)}
                        </span>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {entries.length === 0 && (
        <div className="text-center text-asphalt-400 py-4">
          Este elemento no contiene atributos IFC extendidos embebidos.
        </div>
      )}
    </div>
  );
};

export default PropertiesInspector;
