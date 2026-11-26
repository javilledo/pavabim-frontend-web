import type * as OBC from '@thatopen/components';
import {
  getCachedModelParameterIndex,
  getOrBuildModelParameterIndex,
  parseStrictNumber,
  type ModelParameterIndex,
  type ParameterDefinition,
} from './elementParameterFilter';

export const UNDEFINED_PARAM_VALUE_KEY = '__UNDEFINED__';
export const UNDEFINED_PARAM_LABEL = 'Parámetro no definido';
export const UNDEFINED_PARAM_DEFAULT_COLOR = '#ef4444';

/**
 * High-contrast categorical palette for defined parameter values.
 * Deliberately excludes pure red (#ef4444), which is reserved by default for "Parámetro no definido".
 */
const DISTINCT_VALUE_PALETTE = [
  '#3b82f6', // Azul
  '#22c55e', // Verde
  '#eab308', // Amarillo
  '#8b5cf6', // Violeta
  '#06b6d4', // Cian
  '#f97316', // Naranja
  '#14b8a6', // Turquesa
  '#ec4899', // Rosa
  '#84cc16', // Lima
  '#6366f1', // Índigo
  '#f59e0b', // Ámbar
  '#10b981', // Esmeralda
  '#a855f7', // Púrpura
  '#0ea5e9', // Celeste
  '#d946ef', // Fucsia
  '#64748b', // Gris pizarra
  '#2dd4bf', // Aguamarina
  '#fb923c', // Mandarina
  '#60a5fa', // Azul claro
  '#4ade80', // Verde claro
];

export interface ColorParameterGroup {
  valueKey: string;
  label: string;
  isUndefined: boolean;
  color: string;
  defaultColor: string;
  totalCount: number;
  selectionByModel: Record<string, number[]>;
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getDistinctPaletteColor(index: number): string {
  if (index < DISTINCT_VALUE_PALETTE.length) {
    return DISTINCT_VALUE_PALETTE[index];
  }
  // Golden-angle distribution mapped onto [22..338] deg to avoid pure red [339..21]
  const rawTurn = ((index - DISTINCT_VALUE_PALETTE.length + 1) * 0.38196601125) % 1;
  const hue = 22 + rawTurn * 316;
  const saturation = index % 2 === 0 ? 74 : 66;
  const lightness = index % 3 === 0 ? 54 : index % 3 === 1 ? 47 : 60;
  return hslToHex(hue, saturation, lightness);
}

/**
 * Parses numeric values for 3-decimal rounding while preserving zero-padded codes (e.g. "02", "001") as text.
 */
function parseRoundableNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^[+-]?(?:0|[1-9]\d*)(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return null;
  }
  const num = Number(trimmed.replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

const NON_NUMERIC_IDENTITY_KEYS = new Set([
  'attr::__entity__',
  'attr::GlobalId',
]);

export function normalizeParameterValueForColorGroup(
  rawValues: string[] | undefined,
  parameterKey: string,
): {
  valueKey: string;
  label: string;
  isUndefined: boolean;
  numericSortValue: number | null;
} {
  const defined = (rawValues ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
  if (defined.length === 0) {
    return {
      valueKey: UNDEFINED_PARAM_VALUE_KEY,
      label: UNDEFINED_PARAM_LABEL,
      isUndefined: true,
      numericSortValue: null,
    };
  }

  const allowNumeric = !NON_NUMERIC_IDENTITY_KEYS.has(parameterKey);
  const keyParts: string[] = [];
  const labelParts: string[] = [];
  let singleNumeric: number | null = null;

  for (let i = 0; i < defined.length; i++) {
    const val = defined[i];
    const num = allowNumeric ? parseRoundableNumber(val) : null;
    if (num !== null) {
      const rounded = Math.round((num + Number.EPSILON) * 1000) / 1000;
      const clean = Object.is(rounded, -0) ? 0 : rounded;
      keyParts.push(`num:${clean.toFixed(3)}`);
      labelParts.push(String(Number(clean.toFixed(3))));
      if (defined.length === 1) {
        singleNumeric = clean;
      }
    } else {
      keyParts.push(`str:${val}`);
      labelParts.push(val);
    }
  }

  return {
    valueKey: keyParts.join(' | '),
    label: labelParts.join(', '),
    isUndefined: false,
    numericSortValue: singleNumeric,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function loadVisibleModelsIndexesAndVisibility(
  fragments: OBC.FragmentsManager,
  visibleModels: Array<{ id: string; name: string }>,
  checkElementVisibility: boolean,
): Promise<{
  indexes: ModelParameterIndex[];
  visibilityByModel: Map<string, Set<number> | null>;
}> {
  const indexes: ModelParameterIndex[] = [];
  const visibilityByModel = new Map<string, Set<number> | null>();

  for (const info of visibleModels) {
    const model = fragments.list.get(info.id);
    if (!model || !model.object.visible) continue;

    let indexPromise = getCachedModelParameterIndex(model);
    if (!indexPromise) {
      const categoryBuckets: Array<{ category: string; localIds: number[] }> = [];
      try {
        const geomCategories = await model.getItemsWithGeometryCategories();
        let categories = Array.from(
          new Set(geomCategories.filter((cat): cat is string => Boolean(cat))),
        );

        if (categories.length === 0) {
          const allCategories = await model.getCategories();
          categories = allCategories.filter(
            (cat) => !cat.endsWith('TYPE') && !cat.startsWith('IFCREL'),
          );
        }

        if (categories.length > 0) {
          const itemsMap = await model.getItemsOfCategories(
            categories.map((cat) => new RegExp(`^${escapeRegExp(cat)}$`)),
          );
          for (const category of categories) {
            const ids = itemsMap[category];
            if (ids && ids.length > 0) {
              categoryBuckets.push({ category, localIds: ids });
            }
          }
        }
      } catch (err) {
        console.warn(
          `[colorByParameter] Could not read categories for ${info.name}:`,
          err,
        );
      }

      if (categoryBuckets.length === 0) continue;
      indexPromise = getOrBuildModelParameterIndex(
        model,
        info.id,
        info.name,
        categoryBuckets,
      );
    }

    const index = await indexPromise;
    indexes.push(index);

    if (checkElementVisibility && index.elements.length > 0) {
      try {
        const localIds = index.elements.map((el) => el.localId);
        const flags = await model.getVisible(localIds);
        const visibleSet = new Set<number>();
        for (let i = 0; i < localIds.length; i++) {
          if (flags[i] !== false) {
            visibleSet.add(localIds[i]);
          }
        }
        visibilityByModel.set(info.id, visibleSet);
      } catch {
        visibilityByModel.set(info.id, null);
      }
    } else {
      visibilityByModel.set(info.id, null);
    }
  }

  return { indexes, visibilityByModel };
}

export function extractVisibleParameterDefinitions(
  indexes: ModelParameterIndex[],
  visibilityByModel: Map<string, Set<number> | null>,
): ParameterDefinition[] {
  const merged = new Map<
    string,
    { group: string; name: string; values: Set<string>; elementCount: number }
  >();

  for (const idx of indexes) {
    const visibleSet = visibilityByModel.get(idx.modelId) ?? null;
    for (const elem of idx.elements) {
      if (visibleSet !== null && !visibleSet.has(elem.localId)) continue;

      for (const [paramKey, vals] of elem.params) {
        if (vals.length === 0) continue;
        const meta = idx.parameterMeta.get(paramKey);
        if (!meta) continue;

        let entry = merged.get(paramKey);
        if (!entry) {
          entry = {
            group: meta.group,
            name: meta.name,
            values: new Set<string>(),
            elementCount: 0,
          };
          merged.set(paramKey, entry);
        }
        entry.elementCount += 1;
        for (const v of vals) {
          entry.values.add(v);
        }
      }
    }
  }

  return Array.from(merged.entries())
    .map(([key, item]) => {
      const rawValues = Array.from(item.values);
      const isNumeric =
        rawValues.length > 0 &&
        !NON_NUMERIC_IDENTITY_KEYS.has(key) &&
        rawValues.every((v) => parseStrictNumber(v) !== null);

      const distinctValues = isNumeric
        ? rawValues.sort(
            (a, b) => (parseStrictNumber(a) ?? 0) - (parseStrictNumber(b) ?? 0),
          )
        : rawValues.sort((a, b) =>
            a.localeCompare(b, undefined, {
              numeric: true,
              sensitivity: 'base',
            }),
          );

      return {
        key,
        group: item.group,
        name: item.name,
        elementCount: item.elementCount,
        distinctValues,
        isNumeric,
      };
    })
    .sort((a, b) => {
      const aDirect = a.key.startsWith('attr::');
      const bDirect = b.key.startsWith('attr::');
      if (aDirect !== bDirect) return aDirect ? -1 : 1;
      if (a.group !== b.group) {
        return a.group.localeCompare(b.group, undefined, {
          sensitivity: 'base',
        });
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

export function buildColorByParameterGroups(
  indexes: ModelParameterIndex[],
  visibilityByModel: Map<string, Set<number> | null>,
  parameterKey: string,
  customColorsForParam: Record<string, string> | undefined,
): ColorParameterGroup[] {
  interface MutableBucket {
    valueKey: string;
    label: string;
    isUndefined: boolean;
    numericSortValue: number | null;
    totalCount: number;
    selectionByModel: Record<string, number[]>;
  }

  const definedBuckets = new Map<string, MutableBucket>();
  let undefinedBucket: MutableBucket | null = null;

  for (const idx of indexes) {
    const visibleSet = visibilityByModel.get(idx.modelId) ?? null;

    for (const elem of idx.elements) {
      if (visibleSet !== null && !visibleSet.has(elem.localId)) continue;

      const rawVals = elem.params.get(parameterKey);
      const normalized = normalizeParameterValueForColorGroup(
        rawVals,
        parameterKey,
      );

      if (normalized.isUndefined) {
        if (!undefinedBucket) {
          undefinedBucket = {
            valueKey: UNDEFINED_PARAM_VALUE_KEY,
            label: UNDEFINED_PARAM_LABEL,
            isUndefined: true,
            numericSortValue: null,
            totalCount: 0,
            selectionByModel: {},
          };
        }
        undefinedBucket.totalCount += 1;
        if (!undefinedBucket.selectionByModel[elem.modelId]) {
          undefinedBucket.selectionByModel[elem.modelId] = [elem.localId];
        } else {
          undefinedBucket.selectionByModel[elem.modelId].push(elem.localId);
        }
      } else {
        let bucket = definedBuckets.get(normalized.valueKey);
        if (!bucket) {
          bucket = {
            valueKey: normalized.valueKey,
            label: normalized.label,
            isUndefined: false,
            numericSortValue: normalized.numericSortValue,
            totalCount: 0,
            selectionByModel: {},
          };
          definedBuckets.set(normalized.valueKey, bucket);
        }
        bucket.totalCount += 1;
        if (!bucket.selectionByModel[elem.modelId]) {
          bucket.selectionByModel[elem.modelId] = [elem.localId];
        } else {
          bucket.selectionByModel[elem.modelId].push(elem.localId);
        }
      }
    }
  }

  const definedList = Array.from(definedBuckets.values());
  const allDefinedNumeric =
    definedList.length > 0 &&
    definedList.every((b) => b.numericSortValue !== null);

  definedList.sort((a, b) => {
    if (allDefinedNumeric) {
      return (a.numericSortValue ?? 0) - (b.numericSortValue ?? 0);
    }
    return a.label.localeCompare(b.label, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });

  const result: ColorParameterGroup[] = definedList.map((bucket, idx) => {
    const defaultColor = getDistinctPaletteColor(idx);
    const customColor = customColorsForParam?.[bucket.valueKey];
    return {
      valueKey: bucket.valueKey,
      label: bucket.label,
      isUndefined: false,
      defaultColor,
      color: customColor ? customColor.toLowerCase() : defaultColor,
      totalCount: bucket.totalCount,
      selectionByModel: bucket.selectionByModel,
    };
  });

  if (undefinedBucket && undefinedBucket.totalCount > 0) {
    const customUndefColor = customColorsForParam?.[UNDEFINED_PARAM_VALUE_KEY];
    result.push({
      valueKey: UNDEFINED_PARAM_VALUE_KEY,
      label: UNDEFINED_PARAM_LABEL,
      isUndefined: true,
      defaultColor: UNDEFINED_PARAM_DEFAULT_COLOR,
      color: customUndefColor
        ? customUndefColor.toLowerCase()
        : UNDEFINED_PARAM_DEFAULT_COLOR,
      totalCount: undefinedBucket.totalCount,
      selectionByModel: undefinedBucket.selectionByModel,
    });
  }

  return result;
}
