import React, { useEffect, useMemo, useState } from 'react';
import { useViewerStore } from '../../store/useViewerStore';
import {
  computeSelectionMeasurements,
  type MeasurementSource,
  type MetricSummary,
  type SelectionMeasurementsResult,
} from '../../utils/selectionMeasurements';
import { formatDecimalEs } from '../../utils/numberFormat';
import { useEngine } from '../../viewer/EngineContext';

const MAX_LISTED_ELEMENTS = 50;

function formatNumber(value: number | null, unit: string, decimals = 3): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const formatted = formatDecimalEs(value, decimals);
  return unit ? `${formatted} ${unit}` : formatted;
}

function getSourceBadge(source: MeasurementSource): {
  label: string;
  className: string;
  title: string;
} {
  switch (source) {
    case 'ifc':
      return {
        label: 'IFC',
        className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
        title: 'Obtenido de las propiedades / cantidades IFC',
      };
    case 'geometry':
      return {
        label: '3D',
        className: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
        title: 'Calculado directamente a partir de la geometría 3D',
      };
    case 'mixed':
      return {
        label: 'IFC + 3D',
        className: 'bg-pavasal-500/15 text-pavasal-300 border-pavasal-500/40',
        title: 'Combinación de cantidades IFC y cálculo geométrico 3D',
      };
    default:
      return {
        label: 'N/D',
        className: 'bg-asphalt-800 text-asphalt-400 border-asphalt-700',
        title: 'Sin datos disponibles',
      };
  }
}

interface MetricCardProps {
  label: string;
  valueText: string;
  summary?: MetricSummary;
  unit?: string;
  secondaryGeomLabel?: string;
  helperText?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  valueText,
  summary,
  unit = '',
  secondaryGeomLabel,
  helperText,
}) => {
  const badge = summary ? getSourceBadge(summary.source) : null;
  const hasGeomValue = Boolean(summary && summary.geometryCount > 0);
  const geomText = hasGeomValue
    ? formatNumber(summary!.geometryTotal, unit)
    : '—';

  return (
    <div className="rounded-md border border-asphalt-700 bg-asphalt-950/60 p-2.5 flex flex-col justify-between gap-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-asphalt-400">
          {label}
        </span>
        {badge && (
          <span
            className={`px-1.5 py-0.5 text-[9px] font-semibold rounded border ${badge.className}`}
            title={badge.title}
          >
            {badge.label}
          </span>
        )}
      </div>

      <div className="text-sm font-bold text-white tabular-nums truncate" title={valueText}>
        {valueText}
      </div>

      {hasGeomValue && secondaryGeomLabel ? (
        <div
          className="text-[10px] text-asphalt-400 tabular-nums truncate"
          title={`${secondaryGeomLabel}: ${geomText}`}
        >
          {secondaryGeomLabel}: {geomText}
        </div>
      ) : helperText ? (
        <div className="text-[10px] text-asphalt-400 truncate" title={helperText}>
          {helperText}
        </div>
      ) : secondaryGeomLabel ? (
        <div className="text-[10px] text-asphalt-400 tabular-nums truncate">
          {secondaryGeomLabel}: —
        </div>
      ) : null}
    </div>
  );
};

export const MeasurementsPanel: React.FC = () => {
  const { selectedElementsMap, loadedModels } = useViewerStore();
  const { fragments, focusElement, clearSelection } = useEngine();

  const [result, setResult] = useState<SelectionMeasurementsResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [showElementsList, setShowElementsList] = useState(false);

  const totalSelectedCount = useMemo(
    () =>
      Object.values(selectedElementsMap).reduce(
        (sum, ids) => sum + ids.length,
        0,
      ),
    [selectedElementsMap],
  );

  const modelNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const model of loadedModels) {
      map[model.id] = model.name;
    }
    return map;
  }, [loadedModels]);

  useEffect(() => {
    let cancelled = false;

    if (!fragments || !fragments.initialized || totalSelectedCount === 0) {
      setResult(null);
      setIsComputing(false);
      return;
    }

    setIsComputing(true);

    void computeSelectionMeasurements(
      fragments,
      selectedElementsMap,
      modelNamesById,
      () => cancelled,
    )
      .then((computed) => {
        if (!cancelled) {
          setResult(computed);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsComputing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fragments, modelNamesById, selectedElementsMap, totalSelectedCount]);

  if (totalSelectedCount === 0) {
    return (
      <div className="text-center text-xs text-asphalt-300 mt-8 px-4">
        <p className="font-semibold text-asphalt-100">Mediciones de Selección</p>
        <p className="mt-1.5 text-asphalt-400 leading-relaxed">
          Selecciona uno o varios elementos en la vista 3D o en la pestaña
          Elementos para consultar su cantidad y mediciones de longitud, área y
          volumen.
        </p>
      </div>
    );
  }

  const singleDims =
    result && result.totalCount === 1
      ? result.elements[0]?.dimensions ?? result.boundingDimensions
      : result?.boundingDimensions ?? null;

  const displayedElements = result
    ? result.elements.slice(0, MAX_LISTED_ELEMENTS)
    : [];

  return (
    <div className="space-y-3 text-xs">
      {/* Selection Header */}
      <div className="bg-asphalt-800/80 border border-asphalt-700 border-l-2 border-l-pavasal-500 rounded-md p-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-pavasal-400">
            Resumen seleccionado
          </div>
          <div className="text-[11px] text-asphalt-200 mt-0.5 truncate">
            {totalSelectedCount === 1
              ? result?.elements[0]?.name || '1 elemento'
              : `${totalSelectedCount} elementos seleccionados`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void clearSelection()}
          className="text-[11px] text-asphalt-300 hover:text-white transition-colors shrink-0"
          title="Limpiar selección"
        >
          Limpiar
        </button>
      </div>

      {isComputing && (
        <div className="flex items-center gap-2 rounded border border-asphalt-700 bg-asphalt-900/80 px-2.5 py-2 text-[11px] text-asphalt-300">
          <span className="w-3.5 h-3.5 border-2 border-pavasal-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <span>Calculando mediciones de {totalSelectedCount} elementos...</span>
        </div>
      )}

      {result && (
        <>
          {/* 4 Main Quantity Cards */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Cantidad"
              valueText={`${formatDecimalEs(result.totalCount, 0)} ud${result.totalCount === 1 ? '' : 's'}`}
              helperText={`${result.categories.length} ${result.categories.length === 1 ? 'categoría' : 'categorías'}`}
            />

            <MetricCard
              label="Longitud"
              valueText={
                result.length.source === 'none'
                  ? '—'
                  : formatNumber(result.length.total, 'm')
              }
              summary={result.length}
              unit="m"
              secondaryGeomLabel="Long. 3D"
            />

            <MetricCard
              label="Área"
              valueText={
                result.area.source === 'none'
                  ? '—'
                  : formatNumber(result.area.total, 'm²')
              }
              summary={result.area}
              unit="m²"
              secondaryGeomLabel="Sup. 3D"
              helperText={
                result.geometrySurfaceSkipped && result.area.ifcCount === 0
                  ? 'Solo IFC (>500 uds)'
                  : undefined
              }
            />

            <MetricCard
              label="Volumen"
              valueText={
                result.volume.source === 'none'
                  ? '—'
                  : formatNumber(result.volume.total, 'm³')
              }
              summary={result.volume}
              unit="m³"
              secondaryGeomLabel="Vol. 3D"
            />
          </div>

          {result.geometrySurfaceSkipped && (
            <div className="rounded border border-asphalt-700 bg-asphalt-900/70 px-2.5 py-1.5 text-[10px] text-asphalt-400">
              Para selecciones de más de 500 elementos se priorizan las cantidades IFC y el cálculo rápido de volumen y envolvente.
            </div>
          )}

          {/* Bounding / Oriented Dimensions */}
          {singleDims && (
            <div className="bg-asphalt-950/50 border border-asphalt-700 rounded-md overflow-hidden">
              <div className="px-3 py-1.5 bg-asphalt-950 border-b border-asphalt-700 font-semibold text-pavasal-400 text-[10px] uppercase tracking-wider">
                {result.totalCount === 1
                  ? 'Dimensiones del elemento'
                  : 'Envolvente global de la selección'}
              </div>
              <div className="grid grid-cols-3 divide-x divide-asphalt-800 text-center py-2">
                <div className="px-1.5">
                  <div className="text-[10px] text-asphalt-400">Largo</div>
                  <div className="text-xs font-semibold text-asphalt-100 tabular-nums mt-0.5">
                    {formatNumber(singleDims.length, 'm')}
                  </div>
                </div>
                <div className="px-1.5">
                  <div className="text-[10px] text-asphalt-400">Ancho</div>
                  <div className="text-xs font-semibold text-asphalt-100 tabular-nums mt-0.5">
                    {formatNumber(singleDims.width, 'm')}
                  </div>
                </div>
                <div className="px-1.5">
                  <div className="text-[10px] text-asphalt-400">Alto</div>
                  <div className="text-xs font-semibold text-asphalt-100 tabular-nums mt-0.5">
                    {formatNumber(singleDims.height, 'm')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Breakdown by IFC Category */}
          {result.categories.length > 0 && (
            <div className="bg-asphalt-950/50 border border-asphalt-700 rounded-md overflow-hidden">
              <div className="px-3 py-1.5 bg-asphalt-950 border-b border-asphalt-700 font-semibold text-asphalt-200 text-[10px] uppercase tracking-wider">
                Desglose por entidad ({result.categories.length})
              </div>
              <div className="divide-y divide-asphalt-800">
                {result.categories.map((cat) => (
                  <div key={cat.category} className="px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="font-semibold text-asphalt-100 truncate"
                        title={cat.category}
                      >
                        {cat.category}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-asphalt-800 text-pavasal-400 tabular-nums shrink-0">
                        {formatDecimalEs(cat.count, 0)} {cat.count === 1 ? 'ud' : 'uds'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[10px] text-asphalt-400 tabular-nums">
                      <span>L: {formatNumber(cat.lengthTotal, 'm')}</span>
                      <span>A: {formatNumber(cat.areaTotal, 'm²')}</span>
                      <span>V: {formatNumber(cat.volumeTotal, 'm³')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional Individual Element Breakdown */}
          {result.elements.length > 1 && (
            <div className="bg-asphalt-950/50 border border-asphalt-700 rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setShowElementsList((prev) => !prev)}
                className="w-full px-3 py-1.5 bg-asphalt-950 border-b border-asphalt-700 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-asphalt-200 hover:text-pavasal-400 transition-colors"
              >
                <span>Detalle por elemento ({result.elements.length})</span>
                <span>{showElementsList ? '▾' : '▸'}</span>
              </button>

              {showElementsList && (
                <div className="divide-y divide-asphalt-800 max-h-64 overflow-y-auto">
                  {displayedElements.map((el) => (
                    <button
                      key={`${el.modelId}:${el.localId}`}
                      type="button"
                      onClick={() => void focusElement(el.modelId, el.localId)}
                      className="w-full text-left px-3 py-1.5 hover:bg-asphalt-800/60 transition-colors space-y-0.5"
                      title={`Enfocar ${el.name} (#${el.localId})`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-asphalt-100 truncate">
                          {el.name}
                        </span>
                        <span className="text-[10px] font-mono text-asphalt-400 shrink-0">
                          #{el.localId}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-asphalt-400 tabular-nums">
                        <span>L: {formatNumber(el.effectiveLength, 'm')}</span>
                        <span>A: {formatNumber(el.effectiveArea, 'm²')}</span>
                        <span>V: {formatNumber(el.effectiveVolume, 'm³')}</span>
                      </div>
                    </button>
                  ))}
                  {result.elements.length > MAX_LISTED_ELEMENTS && (
                    <div className="px-3 py-1.5 text-[10px] text-asphalt-400 text-center">
                      Mostrando los primeros {MAX_LISTED_ELEMENTS} de{' '}
                      {result.elements.length} elementos.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MeasurementsPanel;

