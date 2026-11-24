import React, { useMemo } from 'react';
import { useViewerStore } from '../../store/useViewerStore';
import { useEngine } from '../../viewer/EngineContext';

const COLOR_SWATCHES = [
  { hex: '#ef4444', label: 'Rojo' },
  { hex: '#f97316', label: 'Naranja' },
  { hex: '#eab308', label: 'Amarillo' },
  { hex: '#22c55e', label: 'Verde' },
  { hex: '#14b8a6', label: 'Turquesa' },
  { hex: '#06b6d4', label: 'Cian' },
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#8b5cf6', label: 'Violeta' },
  { hex: '#ec4899', label: 'Rosa' },
  { hex: '#64748b', label: 'Gris pizarra' },
];

const QUICK_TRANSPARENCY_STEPS = [0, 25, 50, 75];

interface SelectionAppearanceControlsProps {
  compact?: boolean;
}

export const SelectionAppearanceControls: React.FC<
  SelectionAppearanceControlsProps
> = ({ compact = false }) => {
  const { selectedElementsMap, customAppearancesMap } = useViewerStore();
  const {
    isEngineReady,
    setSelectedElementsColor,
    setSelectedElementsTransparency,
    resetSelectedElementsAppearance,
  } = useEngine();

  const summary = useMemo(() => {
    let totalSelected = 0;
    let hasAnyColor = false;
    let hasAnyOpacity = false;
    let firstColor: string | null | undefined;
    let allSameColor = true;
    let firstTransparency: number | null | undefined;
    let allSameTransparency = true;

    for (const [modelId, ids] of Object.entries(selectedElementsMap)) {
      if (!ids || ids.length === 0) continue;
      const modelOverrides = customAppearancesMap[modelId];

      for (const id of ids) {
        totalSelected++;
        const ov = modelOverrides?.[id];
        const color = ov?.color ?? null;
        const transparency =
          ov?.opacity !== undefined
            ? Math.round((1 - ov.opacity) * 100)
            : null;

        if (color !== null) hasAnyColor = true;
        if (transparency !== null) hasAnyOpacity = true;

        if (firstColor === undefined) {
          firstColor = color;
        } else if (firstColor !== color) {
          allSameColor = false;
        }

        if (firstTransparency === undefined) {
          firstTransparency = transparency;
        } else if (firstTransparency !== transparency) {
          allSameTransparency = false;
        }
      }
    }

    return {
      totalSelected,
      hasAnyColor,
      hasAnyOpacity,
      commonColor: allSameColor ? (firstColor ?? null) : null,
      commonTransparency: allSameTransparency ? (firstTransparency ?? null) : null,
    };
  }, [customAppearancesMap, selectedElementsMap]);

  const disabled = !isEngineReady || summary.totalSelected === 0;
  const sliderValue = summary.commonTransparency ?? 0;

  return (
    <div className={compact ? 'space-y-2.5 text-xs' : 'space-y-3 text-xs'}>
      {/* Color Picker Section */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-asphalt-300">
            Color
          </span>
          <button
            type="button"
            disabled={disabled || !summary.hasAnyColor}
            onClick={() => void setSelectedElementsColor(null)}
            className="text-[10px] font-medium text-pavasal-400 hover:text-pavasal-300 disabled:text-asphalt-500 disabled:opacity-50 transition-colors"
            title="Restaurar el color original IFC de los elementos seleccionados"
          >
            Original
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {COLOR_SWATCHES.map((swatch) => {
            const isActive = summary.commonColor === swatch.hex;
            return (
              <button
                key={swatch.hex}
                type="button"
                disabled={disabled}
                onClick={() => void setSelectedElementsColor(swatch.hex)}
                style={{ backgroundColor: swatch.hex }}
                aria-label={`Color ${swatch.label}`}
                title={`${swatch.label} (${swatch.hex})`}
                className={`w-5 h-5 rounded border transition-transform disabled:opacity-40 ${
                  isActive
                    ? 'border-white ring-2 ring-pavasal-400 scale-110'
                    : 'border-asphalt-600/80 hover:scale-110 hover:border-asphalt-200'
                }`}
              />
            );
          })}

          <label
            className="w-5 h-5 rounded border border-asphalt-600 bg-asphalt-800 hover:border-pavasal-500 flex items-center justify-center cursor-pointer overflow-hidden relative"
            title="Elegir color personalizado"
          >
            <input
              type="color"
              disabled={disabled}
              value={summary.commonColor ?? '#3b82f6'}
              onChange={(e) => void setSelectedElementsColor(e.target.value)}
              aria-label="Selector de color personalizado"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <span
              className="w-3 h-3 rounded-sm border border-asphalt-950/30"
              style={{
                background:
                  summary.commonColor ??
                  'conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #ec4899, #ef4444)',
              }}
            />
          </label>
        </div>
      </div>

      {/* Transparency Section */}
      <div className="space-y-1.5 pt-2 border-t border-asphalt-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-asphalt-300">
              Transparencia
            </span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-asphalt-950 border border-asphalt-700 text-asphalt-200">
              {summary.commonTransparency !== null
                ? `${summary.commonTransparency}%`
                : summary.hasAnyOpacity
                  ? 'Mixta'
                  : '0%'}
            </span>
          </div>
          <button
            type="button"
            disabled={disabled || !summary.hasAnyOpacity}
            onClick={() => void setSelectedElementsTransparency(null)}
            className="text-[10px] font-medium text-pavasal-400 hover:text-pavasal-300 disabled:text-asphalt-500 disabled:opacity-50 transition-colors"
            title="Restaurar la transparencia original IFC de los elementos seleccionados"
          >
            Original
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={90}
          step={5}
          disabled={disabled}
          value={sliderValue}
          onChange={(e) =>
            void setSelectedElementsTransparency(Number(e.target.value))
          }
          aria-label="Transparencia de los elementos seleccionados"
          className="w-full h-1.5 accent-pavasal-500 bg-asphalt-800 rounded-lg cursor-pointer disabled:opacity-40"
        />

        <div className="grid grid-cols-4 gap-1">
          {QUICK_TRANSPARENCY_STEPS.map((pct) => {
            const isActive = summary.commonTransparency === pct;
            return (
              <button
                key={pct}
                type="button"
                disabled={disabled}
                onClick={() => void setSelectedElementsTransparency(pct)}
                className={`py-0.5 rounded border text-[10px] font-mono transition-colors disabled:opacity-40 ${
                  isActive
                    ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950 font-semibold'
                    : 'border-asphalt-700 bg-asphalt-800/80 text-asphalt-200 hover:border-pavasal-500/60 hover:text-pavasal-300'
                }`}
              >
                {pct}%
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset Selection Appearance */}
      <div className="pt-2 border-t border-asphalt-800">
        <button
          type="button"
          disabled={
            disabled || (!summary.hasAnyColor && !summary.hasAnyOpacity)
          }
          onClick={() => void resetSelectedElementsAppearance()}
          className="w-full py-1.5 px-2 rounded border border-asphalt-700 bg-asphalt-800 text-[11px] font-medium text-asphalt-100 hover:border-pavasal-500/60 hover:text-pavasal-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Restablecer seleccionados
        </button>
      </div>
    </div>
  );
};

export default SelectionAppearanceControls;
