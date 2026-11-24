import type * as FRAGS from '@thatopen/fragments';

export const DEFAULT_TYPE_LABEL = 'Sin tipo definido';
export const DIRECT_ATTR_GROUP = 'Atributos IFC';
export const VARIOS_FLAG = '__pavabimVarios';
export const STRUCTURED_GROUPS_KEY = '__pavabimPropertyGroups';

export interface VariosAttributeMarker {
  value: '<varios>';
  [VARIOS_FLAG]: true;
}

export type InspectorPropertyValue = string | VariosAttributeMarker;

export interface InspectorPropertyGroup {
  name: string;
  isAttributesGroup?: boolean;
  entries: Array<{ key: string; value: InspectorPropertyValue }>;
}

export interface StructuredElementPropertiesPayload
  extends Record<string, unknown> {
  _guid?: { value: string };
  [STRUCTURED_GROUPS_KEY]: InspectorPropertyGroup[];
}

export function createVariosMarker(): VariosAttributeMarker {
  return {
    value: '<varios>',
    [VARIOS_FLAG]: true,
  };
}

export function isVariosMarker(val: unknown): val is VariosAttributeMarker {
  if (!val || typeof val !== 'object') return false;
  return Boolean((val as Record<string, unknown>)[VARIOS_FLAG]);
}

export type ParameterFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'one_of'
  | 'none_of'
  | 'is_defined'
  | 'is_not_defined';

export interface OperatorOption {
  value: ParameterFilterOperator;
  label: string;
  needsValue: boolean;
  isMultiValue: boolean;
}

export const OPERATOR_OPTIONS: OperatorOption[] = [
  { value: 'equals', label: 'es', needsValue: true, isMultiValue: false },
  { value: 'not_equals', label: 'no es', needsValue: true, isMultiValue: false },
  {
    value: 'contains',
    label: 'contiene',
    needsValue: true,
    isMultiValue: false,
  },
  {
    value: 'not_contains',
    label: 'no contiene',
    needsValue: true,
    isMultiValue: false,
  },
  {
    value: 'starts_with',
    label: 'comienza por',
    needsValue: true,
    isMultiValue: false,
  },
  {
    value: 'ends_with',
    label: 'termina en',
    needsValue: true,
    isMultiValue: false,
  },
  { value: 'one_of', label: 'uno de', needsValue: true, isMultiValue: true },
  {
    value: 'none_of',
    label: 'ninguno de',
    needsValue: true,
    isMultiValue: true,
  },
  {
    value: 'is_defined',
    label: 'está definido',
    needsValue: false,
    isMultiValue: false,
  },
  {
    value: 'is_not_defined',
    label: 'no está definido',
    needsValue: false,
    isMultiValue: false,
  },
];

export interface ParameterDefinition {
  key: string;
  group: string;
  name: string;
  distinctValues: string[];
  elementCount: number;
}

export interface FilterCondition {
  id: string;
  parameterKey: string;
  operator: ParameterFilterOperator;
  value: string;
}

export interface IndexedElementRecord {
  modelId: string;
  modelName: string;
  localId: number;
  category: string;
  typeName: string;
  name: string;
  params: Map<string, string[]>;
}

interface RawParameterAccumulator {
  group: string;
  name: string;
  values: Set<string>;
  count: number;
}

export interface ModelParameterIndex {
  modelId: string;
  elements: IndexedElementRecord[];
  parameterMeta: Map<string, RawParameterAccumulator>;
}

let nextConditionSeq = 1;

export function createEmptyFilterCondition(
  defaultParamKey = '',
): FilterCondition {
  return {
    id: `cond-${Date.now()}-${nextConditionSeq++}`,
    parameterKey: defaultParamKey,
    operator: 'equals',
    value: '',
  };
}

export function operatorNeedsValue(op: ParameterFilterOperator): boolean {
  return op !== 'is_defined' && op !== 'is_not_defined';
}

export function operatorIsMultiValue(op: ParameterFilterOperator): boolean {
  return op === 'one_of' || op === 'none_of';
}

export function isConditionReady(cond: FilterCondition): boolean {
  if (!cond.parameterKey) return false;
  if (!operatorNeedsValue(cond.operator)) return true;
  if (operatorIsMultiValue(cond.operator)) {
    return parseMultiValueList(cond.value).length > 0;
  }
  return cond.value.trim().length > 0;
}

export function areConditionListsEqual(
  a: FilterCondition[],
  b: FilterCondition[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].parameterKey !== b[i].parameterKey ||
      a[i].operator !== b[i].operator ||
      (operatorNeedsValue(a[i].operator) &&
        a[i].value.trim() !== b[i].value.trim())
    ) {
      return false;
    }
  }
  return true;
}

export function parseMultiValueList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function formatScalarValue(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return String(Number(raw.toFixed(6)));
  }
  if (typeof raw === 'boolean') {
    return raw ? 'true' : 'false';
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
    return formatScalarValue((raw as Record<string, unknown>).value);
  }
  return null;
}

function extractValuesFromAttr(attr: unknown): string[] {
  if (attr === null || attr === undefined) return [];
  if (Array.isArray(attr)) {
    const out: string[] = [];
    for (const item of attr) {
      for (const v of extractValuesFromAttr(item)) {
        out.push(v);
      }
    }
    return out;
  }
  if (typeof attr === 'object' && 'value' in (attr as Record<string, unknown>)) {
    const inner = (attr as Record<string, unknown>).value;
    if (Array.isArray(inner)) {
      return extractValuesFromAttr(inner);
    }
    const formatted = formatScalarValue(inner);
    return formatted !== null ? [formatted] : [];
  }
  const formatted = formatScalarValue(attr);
  return formatted !== null ? [formatted] : [];
}

function readFirstString(attr: unknown): string | null {
  const vals = extractValuesFromAttr(attr);
  return vals.length > 0 ? vals[0] : null;
}

const IGNORED_DIRECT_KEYS = new Set([
  '_category',
  '_localId',
  '_guid',
  'Representation',
  'ObjectPlacement',
  'OwnerHistory',
]);

const QUANTITY_VALUE_KEYS = [
  'LengthValue',
  'AreaValue',
  'VolumeValue',
  'WeightValue',
  'CountValue',
  'TimeValue',
];

const PROPERTY_VALUE_KEYS = [
  'NominalValue',
  'EnumerationValues',
  'ListValues',
  'UpperBoundValue',
  'LowerBoundValue',
  'SetPointValue',
];

function isTypeDefinitionObject(obj: Record<string, unknown>): boolean {
  const cat = (readFirstString(obj._category) || '').toUpperCase();
  return (
    cat.endsWith('TYPE') ||
    cat.endsWith('STYLE') ||
    Array.isArray(obj.HasPropertySets)
  );
}

function resolveElementTypeFromData(item: Record<string, unknown>): string {
  const checkTypeArray = (arr: unknown): string | null => {
    if (!Array.isArray(arr)) return null;
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      if (!isTypeDefinitionObject(obj)) continue;
      const typedName =
        readFirstString(obj.Name) ||
        readFirstString(obj.ElementType) ||
        readFirstString(obj.Tag);
      if (typedName) return typedName;
    }
    return null;
  };

  const fromIsTypedBy = checkTypeArray(item.IsTypedBy);
  if (fromIsTypedBy) return fromIsTypedBy;

  const fromIsDefinedBy = checkTypeArray(item.IsDefinedBy);
  if (fromIsDefinedBy) return fromIsDefinedBy;

  const objectType = readFirstString(item.ObjectType);
  if (objectType) return objectType;

  const elementType = readFirstString(item.ElementType);
  if (elementType) return elementType;

  const predefined = readFirstString(item.PredefinedType);
  if (
    predefined &&
    predefined !== 'NOTDEFINED' &&
    predefined !== 'USERDEFINED'
  ) {
    return predefined;
  }

  return DEFAULT_TYPE_LABEL;
}

function resolveElementNameFromData(
  item: Record<string, unknown>,
  category: string,
  localId: number,
): string {
  return (
    readFirstString(item.Name) ||
    readFirstString(item.Tag) ||
    `${category} #${localId}`
  );
}

function extractPsetOrQtoEntries(
  psetObj: Record<string, unknown>,
  targetMap: Map<string, { group: string; name: string; values: string[] }>,
  allowOverwrite: boolean,
): void {
  const hasProps = Array.isArray(psetObj.HasProperties)
    ? (psetObj.HasProperties as Record<string, unknown>[])
    : null;
  const quantities = Array.isArray(psetObj.Quantities)
    ? (psetObj.Quantities as Record<string, unknown>[])
    : null;

  if (hasProps || quantities) {
    const groupName =
      readFirstString(psetObj.Name) ||
      (quantities ? 'Quantities' : 'Property Set');

    if (hasProps) {
      for (const prop of hasProps) {
        if (!prop || typeof prop !== 'object') continue;
        const propName = readFirstString(prop.Name);
        if (!propName) continue;

        const values: string[] = [];
        for (const vk of PROPERTY_VALUE_KEYS) {
          if (vk in prop) {
            values.push(...extractValuesFromAttr(prop[vk]));
          }
        }
        if (values.length === 0) {
          for (const [k, rawVal] of Object.entries(prop)) {
            if (
              k === 'Name' ||
              k === 'Description' ||
              k === 'Unit' ||
              IGNORED_DIRECT_KEYS.has(k) ||
              Array.isArray(rawVal)
            ) {
              continue;
            }
            values.push(...extractValuesFromAttr(rawVal));
          }
        }

        const paramKey = `pset::${groupName}::${propName}`;
        const existing = targetMap.get(paramKey);
        if (
          !existing ||
          (allowOverwrite && (values.length > 0 || existing.values.length === 0))
        ) {
          targetMap.set(paramKey, {
            group: groupName,
            name: propName,
            values: Array.from(new Set(values)),
          });
        }
      }
    }

    if (quantities) {
      for (const qty of quantities) {
        if (!qty || typeof qty !== 'object') continue;
        const qtyName = readFirstString(qty.Name);
        if (!qtyName) continue;

        const values: string[] = [];
        for (const qk of QUANTITY_VALUE_KEYS) {
          if (qk in qty) {
            values.push(...extractValuesFromAttr(qty[qk]));
          }
        }

        const paramKey = `pset::${groupName}::${qtyName}`;
        const existing = targetMap.get(paramKey);
        if (
          !existing ||
          (allowOverwrite && (values.length > 0 || existing.values.length === 0))
        ) {
          targetMap.set(paramKey, {
            group: groupName,
            name: qtyName,
            values: Array.from(new Set(values)),
          });
        }
      }
    }
    return;
  }

  // Handle pre-defined IFC property entities (e.g. IfcDoorLiningProperties, IfcWindowPanelProperties)
  if (!isTypeDefinitionObject(psetObj)) {
    const cat = readFirstString(psetObj._category) || '';
    const groupName = readFirstString(psetObj.Name) || cat || 'Property Set';
    for (const [k, rawVal] of Object.entries(psetObj)) {
      if (k === 'Name' || IGNORED_DIRECT_KEYS.has(k) || Array.isArray(rawVal)) {
        continue;
      }
      const values = extractValuesFromAttr(rawVal);
      const paramKey = `pset::${groupName}::${k}`;
      const existing = targetMap.get(paramKey);
      if (
        !existing ||
        (allowOverwrite && (values.length > 0 || existing.values.length === 0))
      ) {
        targetMap.set(paramKey, {
          group: groupName,
          name: k,
          values: Array.from(new Set(values)),
        });
      }
    }
  }
}

function collectMaterialInfo(
  assocArray: unknown,
  materialNames: Set<string>,
  psetTargetMap?: Map<string, { group: string; name: string; values: string[] }>,
): void {
  if (!Array.isArray(assocArray)) return;

  const visitMaterialNode = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const cat = (readFirstString(obj._category) || '').toUpperCase();

    if (cat.includes('MATERIAL')) {
      const name =
        readFirstString(obj.Name) ||
        readFirstString(obj.LayerSetName) ||
        readFirstString(obj.Category);
      if (name) {
        materialNames.add(name);
      }

      if (psetTargetMap && Array.isArray(obj.HasProperties)) {
        extractPsetOrQtoEntries(
          {
            ...obj,
            Name: obj.Name ?? { value: 'Propiedades de Material' },
          },
          psetTargetMap,
          false,
        );
      }

      if (Array.isArray(obj.Materials)) {
        for (const sub of obj.Materials) visitMaterialNode(sub);
      }
      if (Array.isArray(obj.ForLayerSet)) {
        for (const sub of obj.ForLayerSet) visitMaterialNode(sub);
      }
      if (Array.isArray(obj.MaterialLayers)) {
        for (const sub of obj.MaterialLayers) visitMaterialNode(sub);
      }
      if (Array.isArray(obj.MaterialConstituents)) {
        for (const sub of obj.MaterialConstituents) visitMaterialNode(sub);
      }
      if (Array.isArray(obj.MaterialProfiles)) {
        for (const sub of obj.MaterialProfiles) visitMaterialNode(sub);
      }
      if (Array.isArray(obj.Material)) {
        for (const sub of obj.Material) visitMaterialNode(sub);
      }
    }
  };

  for (const assoc of assocArray) {
    visitMaterialNode(assoc);
  }
}

function collectClassificationValues(item: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const inspectArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      const cat = (readFirstString(obj._category) || '').toUpperCase();
      if (
        cat &&
        !cat.includes('CLASSIFICATION') &&
        obj.Identification === undefined &&
        obj.ItemReference === undefined
      ) {
        continue;
      }
      const code =
        readFirstString(obj.Identification) ||
        readFirstString(obj.ItemReference);
      const name = readFirstString(obj.Name);
      if (code && name) {
        out.add(`${code} - ${name}`);
      } else if (code || name) {
        out.add((code || name)!);
      }
    }
  };

  inspectArray(item.ClassificationRefForObjects);
  inspectArray(item.HasAssociations);
  return Array.from(out);
}

function collectSpatialNames(item: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const inspectSpatial = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const sp of arr) {
      if (!sp || typeof sp !== 'object') continue;
      const spObj = sp as Record<string, unknown>;
      const spName =
        readFirstString(spObj.Name) || readFirstString(spObj.LongName);
      if (spName) out.add(spName);
    }
  };
  inspectSpatial(item.ContainedInStructure);
  inspectSpatial(item.ReferencedInStructures);
  return Array.from(out);
}

type ItemsDataConfigType = Parameters<FRAGS.FragmentsModel['getItemsData']>[1];

const modelItemsDataConfigCache = new WeakMap<
  FRAGS.FragmentsModel,
  Promise<ItemsDataConfigType>
>();

/**
 * Builds and caches a safe `getItemsData` config for a model that traverses all
 * forward IFC property, type, quantity, spatial, material, and classification
 * relations while explicitly blocking every inverse relation (preventing O(N^2)
 * fan-out through DefinesOccurrence / ObjectTypeOf / AssociatedTo / ContainsElements).
 */
export function getSafeElementItemsDataConfig(
  model: FRAGS.FragmentsModel,
): Promise<ItemsDataConfigType> {
  const cached = modelItemsDataConfigCache.get(model);
  if (cached) return cached;

  const configPromise = (async (): Promise<ItemsDataConfigType> => {
    const relationsBlockMap: Record<
      string,
      { attributes: boolean; relations: boolean }
    > = {
      DefinesOccurrence: { attributes: false, relations: false },
      DefinesOcurrence: { attributes: false, relations: false },
      ObjectTypeOf: { attributes: false, relations: false },
      ContainsElements: { attributes: false, relations: false },
      ReferencesElements: { attributes: false, relations: false },
      AssociatedTo: { attributes: false, relations: false },
      HasReferences: { attributes: false, relations: false },
      Declares: { attributes: false, relations: false },
      HasContext: { attributes: false, relations: false },
    };

    try {
      const relationNames = await model.getRelationNames();
      for (const relName of relationNames) {
        if (relName) {
          relationsBlockMap[relName] = { attributes: false, relations: false };
        }
      }
    } catch {
      // Fallback to static block map
    }

    // Forward relations carrying element properties, types, quantities, spatial levels & materials
    relationsBlockMap.IsDefinedBy = { attributes: true, relations: true };
    relationsBlockMap.IsTypedBy = { attributes: true, relations: true };
    relationsBlockMap.HasPropertySets = { attributes: true, relations: true };
    relationsBlockMap.HasProperties = { attributes: true, relations: false };
    relationsBlockMap.Quantities = { attributes: true, relations: false };
    relationsBlockMap.ContainedInStructure = {
      attributes: true,
      relations: false,
    };
    relationsBlockMap.ReferencedInStructures = {
      attributes: true,
      relations: false,
    };
    relationsBlockMap.ClassificationRefForObjects = {
      attributes: true,
      relations: false,
    };
    relationsBlockMap.HasAssociations = { attributes: true, relations: true };
    relationsBlockMap.ForLayerSet = { attributes: true, relations: true };
    relationsBlockMap.MaterialLayers = { attributes: true, relations: true };
    relationsBlockMap.MaterialConstituents = {
      attributes: true,
      relations: true,
    };
    relationsBlockMap.MaterialProfiles = { attributes: true, relations: true };
    relationsBlockMap.Materials = { attributes: true, relations: false };
    relationsBlockMap.Material = { attributes: true, relations: false };

    return {
      attributesDefault: true,
      relationsDefault: { attributes: false, relations: false },
      relations: relationsBlockMap,
    } as ItemsDataConfigType;
  })();

  configPromise.catch(() => {
    modelItemsDataConfigCache.delete(model);
  });

  modelItemsDataConfigCache.set(model, configPromise);
  return configPromise;
}

/**
 * Extracts all properties of a single IFC element item grouped into
 * `Atributos IFC` plus every Property Set (`IFCPROPERTYSET`) and Quantity Set (`IFCELEMENTQUANTITY`).
 */
export function extractInspectorPropertyGroups(
  rawItem: Record<string, unknown>,
): { guid?: string; groups: InspectorPropertyGroup[] } {
  const directEntries = new Map<string, string>();

  const category = readFirstString(rawItem._category);
  if (category) {
    directEntries.set('IfcEntity', category);
  }

  const guid = readFirstString(rawItem._guid) ?? undefined;
  if (guid) {
    directEntries.set('GlobalId', guid);
  }

  const typeName = resolveElementTypeFromData(rawItem);
  if (typeName && typeName !== DEFAULT_TYPE_LABEL) {
    directEntries.set('Tipo (Type)', typeName);
  }

  const spatialNames = collectSpatialNames(rawItem);
  if (spatialNames.length > 0) {
    directEntries.set(
      'Nivel / Contenedor espacial',
      spatialNames.join(', '),
    );
  }

  // Direct occurrence attributes
  for (const [key, val] of Object.entries(rawItem)) {
    if (IGNORED_DIRECT_KEYS.has(key) || Array.isArray(val)) continue;
    const extracted = extractValuesFromAttr(val);
    directEntries.set(key, extracted.length > 0 ? extracted.join(', ') : '—');
  }

  const psetProps = new Map<
    string,
    { group: string; name: string; values: string[] }
  >();
  const materialNames = new Set<string>();
  collectMaterialInfo(rawItem.HasAssociations, materialNames, psetProps);

  const classifications = collectClassificationValues(rawItem);

  const inspectTypeEntities = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      if (!isTypeDefinitionObject(obj)) continue;

      collectMaterialInfo(obj.HasAssociations, materialNames, psetProps);
      for (const cls of collectClassificationValues(obj)) {
        if (!classifications.includes(cls)) classifications.push(cls);
      }

      // Inherit Type-level direct attributes not present on the occurrence
      for (const [k, v] of Object.entries(obj)) {
        if (
          k === 'Name' ||
          IGNORED_DIRECT_KEYS.has(k) ||
          Array.isArray(v) ||
          directEntries.has(k)
        ) {
          continue;
        }
        const extracted = extractValuesFromAttr(v);
        if (extracted.length > 0) {
          directEntries.set(k, extracted.join(', '));
        }
      }

      if (Array.isArray(obj.HasPropertySets)) {
        for (const typePset of obj.HasPropertySets) {
          if (typePset && typeof typePset === 'object') {
            extractPsetOrQtoEntries(
              typePset as Record<string, unknown>,
              psetProps,
              false,
            );
          }
        }
      }
    }
  };

  inspectTypeEntities(rawItem.IsTypedBy);
  inspectTypeEntities(rawItem.IsDefinedBy);

  if (Array.isArray(rawItem.IsDefinedBy)) {
    for (const defEntry of rawItem.IsDefinedBy) {
      if (defEntry && typeof defEntry === 'object') {
        extractPsetOrQtoEntries(
          defEntry as Record<string, unknown>,
          psetProps,
          true,
        );
      }
    }
  }

  if (materialNames.size > 0) {
    directEntries.set('Material', Array.from(materialNames).join(', '));
  }

  if (classifications.length > 0) {
    directEntries.set('Clasificación', classifications.join(', '));
  }

  const groups: InspectorPropertyGroup[] = [];

  if (directEntries.size > 0) {
    groups.push({
      name: DIRECT_ATTR_GROUP,
      isAttributesGroup: true,
      entries: Array.from(directEntries.entries()).map(([key, value]) => ({
        key,
        value,
      })),
    });
  }

  const groupedPsets = new Map<
    string,
    Array<{ key: string; value: InspectorPropertyValue }>
  >();

  for (const pEntry of psetProps.values()) {
    let list = groupedPsets.get(pEntry.group);
    if (!list) {
      list = [];
      groupedPsets.set(pEntry.group, list);
    }
    list.push({
      key: pEntry.name,
      value: pEntry.values.length > 0 ? pEntry.values.join(', ') : '—',
    });
  }

  const sortedPsetNames = Array.from(groupedPsets.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );

  for (const psetName of sortedPsetNames) {
    const entries = groupedPsets
      .get(psetName)!
      .sort((a, b) =>
        a.key.localeCompare(b.key, undefined, { sensitivity: 'base' }),
      );
    if (entries.length > 0) {
      groups.push({
        name: psetName,
        entries,
      });
    }
  }

  return { guid, groups };
}

/**
 * Builds the `selectedElementProperties` payload for 1 or N selected elements,
 * preserving `_guid` when a single element is selected (for BCF viewpoints)
 * and merging common values vs `<varios>` across all Property Sets on multi-selection.
 */
export function buildStructuredSelectionProperties(
  rawItems: Record<string, unknown>[],
  totalSelectedCount = rawItems.length,
): StructuredElementPropertiesPayload {
  if (rawItems.length === 1 && totalSelectedCount === 1) {
    const single = extractInspectorPropertyGroups(rawItems[0]);
    return {
      ...(single.guid ? { _guid: { value: single.guid } } : {}),
      [STRUCTURED_GROUPS_KEY]: single.groups,
    };
  }

  const extractedList = rawItems.map(extractInspectorPropertyGroups);
  const groupOrder: string[] = [];
  const groupIsAttr = new Map<string, boolean>();
  const propKeysByGroup = new Map<string, string[]>();
  const propSeenByGroup = new Map<string, Set<string>>();
  const perItemGroupMaps: Array<Map<string, Map<string, string>>> = [];

  for (const item of extractedList) {
    const gMap = new Map<string, Map<string, string>>();
    for (const grp of item.groups) {
      if (!propKeysByGroup.has(grp.name)) {
        groupOrder.push(grp.name);
        groupIsAttr.set(grp.name, Boolean(grp.isAttributesGroup));
        propKeysByGroup.set(grp.name, []);
        propSeenByGroup.set(grp.name, new Set<string>());
      }
      const keyOrder = propKeysByGroup.get(grp.name)!;
      const keySeen = propSeenByGroup.get(grp.name)!;
      const pMap = new Map<string, string>();
      for (const entry of grp.entries) {
        if (!keySeen.has(entry.key)) {
          keySeen.add(entry.key);
          keyOrder.push(entry.key);
        }
        pMap.set(entry.key, String(entry.value));
      }
      gMap.set(grp.name, pMap);
    }
    perItemGroupMaps.push(gMap);
  }

  const sortedGroupNames = [...groupOrder].sort((a, b) => {
    const aAttr = groupIsAttr.get(a) ?? false;
    const bAttr = groupIsAttr.get(b) ?? false;
    if (aAttr !== bAttr) return aAttr ? -1 : 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });

  const mergedGroups: InspectorPropertyGroup[] = [];
  const isPartialSample = rawItems.length < totalSelectedCount;

  for (const groupName of sortedGroupNames) {
    const propKeys = propKeysByGroup.get(groupName) ?? [];
    const mergedEntries: Array<{ key: string; value: InspectorPropertyValue }> =
      [];

    for (const propKey of propKeys) {
      if (isPartialSample) {
        mergedEntries.push({ key: propKey, value: createVariosMarker() });
        continue;
      }

      let allHaveProp = true;
      let firstVal: string | null = null;
      let allSame = true;

      for (let i = 0; i < perItemGroupMaps.length; i++) {
        const val = perItemGroupMaps[i].get(groupName)?.get(propKey);
        if (val === undefined) {
          allHaveProp = false;
          allSame = false;
          break;
        }
        if (i === 0) {
          firstVal = val;
        } else if (val !== firstVal) {
          allSame = false;
          break;
        }
      }

      mergedEntries.push({
        key: propKey,
        value:
          allHaveProp && allSame && firstVal !== null
            ? firstVal
            : createVariosMarker(),
      });
    }

    if (mergedEntries.length > 0) {
      mergedGroups.push({
        name: groupName,
        isAttributesGroup: groupIsAttr.get(groupName),
        entries: mergedEntries,
      });
    }
  }

  return {
    [STRUCTURED_GROUPS_KEY]: mergedGroups,
  };
}

const INDEX_CHUNK_SIZE = 350;

const modelParameterIndexCache = new WeakMap<
  FRAGS.FragmentsModel,
  Promise<ModelParameterIndex>
>();

export function getOrBuildModelParameterIndex(
  model: FRAGS.FragmentsModel,
  modelId: string,
  modelName: string,
  categoryBuckets: Array<{ category: string; localIds: number[] }>,
): Promise<ModelParameterIndex> {
  const cached = modelParameterIndexCache.get(model);
  if (cached) {
    return cached;
  }

  const buildPromise = (async (): Promise<ModelParameterIndex> => {
    const itemsDataConfig = await getSafeElementItemsDataConfig(model);

    const elements: IndexedElementRecord[] = [];
    const parameterMeta = new Map<string, RawParameterAccumulator>();

    const recordParameter = (
      elemParams: Map<string, string[]>,
      key: string,
      group: string,
      name: string,
      values: string[],
    ) => {
      let meta = parameterMeta.get(key);
      if (!meta) {
        meta = { group, name, values: new Set<string>(), count: 0 };
        parameterMeta.set(key, meta);
      }

      const cleanValues = Array.from(
        new Set(values.map((v) => v.trim()).filter((v) => v.length > 0)),
      );
      if (cleanValues.length > 0) {
        elemParams.set(key, cleanValues);
        meta.count += 1;
        for (const val of cleanValues) {
          meta.values.add(val);
        }
      }
    };

    for (const bucket of categoryBuckets) {
      const { category, localIds } = bucket;
      for (let i = 0; i < localIds.length; i += INDEX_CHUNK_SIZE) {
        const chunkIds = localIds.slice(i, i + INDEX_CHUNK_SIZE);
        let chunkData: FRAGS.ItemData[] = [];
        try {
          chunkData = await model.getItemsData(chunkIds, itemsDataConfig);
        } catch (err) {
          console.warn(
            `[elementParameterFilter] Failed reading chunk in ${modelName}:`,
            err,
          );
          continue;
        }

        for (let j = 0; j < chunkIds.length; j++) {
          const fallbackId = chunkIds[j];
          const rawItem = chunkData[j] as unknown as
            | Record<string, unknown>
            | undefined;
          if (!rawItem || typeof rawItem !== 'object') continue;

          const parsedLocalId = Number(readFirstString(rawItem._localId));
          const resolvedId = Number.isFinite(parsedLocalId)
            ? parsedLocalId
            : fallbackId;
          const resolvedCategory =
            readFirstString(rawItem._category) || category;
          const typeName = resolveElementTypeFromData(rawItem);
          const elementName = resolveElementNameFromData(
            rawItem,
            resolvedCategory,
            resolvedId,
          );

          const elemParams = new Map<string, string[]>();

          // 1. Core IFC identity attributes
          recordParameter(
            elemParams,
            'attr::__entity__',
            DIRECT_ATTR_GROUP,
            'IfcEntity',
            [resolvedCategory],
          );

          if (typeName && typeName !== DEFAULT_TYPE_LABEL) {
            recordParameter(
              elemParams,
              'attr::__type__',
              DIRECT_ATTR_GROUP,
              'Tipo (Type)',
              [typeName],
            );
          }

          const guid = readFirstString(rawItem._guid);
          if (guid) {
            recordParameter(
              elemParams,
              'attr::GlobalId',
              DIRECT_ATTR_GROUP,
              'GlobalId',
              [guid],
            );
          }

          // 2. Spatial container (Storey / Building / Site)
          const spatialNames = collectSpatialNames(rawItem);
          if (spatialNames.length > 0) {
            recordParameter(
              elemParams,
              'attr::__storey__',
              DIRECT_ATTR_GROUP,
              'Nivel / Contenedor espacial',
              spatialNames,
            );
          }

          // 3. Direct IFC attributes on the occurrence
          for (const [key, val] of Object.entries(rawItem)) {
            if (IGNORED_DIRECT_KEYS.has(key) || Array.isArray(val)) continue;
            const extracted = extractValuesFromAttr(val);
            if (extracted.length > 0) {
              recordParameter(
                elemParams,
                `attr::${key}`,
                DIRECT_ATTR_GROUP,
                key,
                extracted,
              );
            }
          }

          // 4. Property Sets & Quantity Sets (Type defaults first, then Occurrence overrides)
          const psetProps = new Map<
            string,
            { group: string; name: string; values: string[] }
          >();
          const materialNames = new Set<string>();
          collectMaterialInfo(rawItem.HasAssociations, materialNames, psetProps);
          const classifications = collectClassificationValues(rawItem);

          const processTypeEntities = (arr: unknown) => {
            if (!Array.isArray(arr)) return;
            for (const entry of arr) {
              if (!entry || typeof entry !== 'object') continue;
              const obj = entry as Record<string, unknown>;
              if (!isTypeDefinitionObject(obj)) continue;
              collectMaterialInfo(obj.HasAssociations, materialNames, psetProps);
              for (const cls of collectClassificationValues(obj)) {
                if (!classifications.includes(cls)) classifications.push(cls);
              }
              if (Array.isArray(obj.HasPropertySets)) {
                for (const typePset of obj.HasPropertySets) {
                  if (typePset && typeof typePset === 'object') {
                    extractPsetOrQtoEntries(
                      typePset as Record<string, unknown>,
                      psetProps,
                      false,
                    );
                  }
                }
              }
            }
          };

          processTypeEntities(rawItem.IsTypedBy);
          processTypeEntities(rawItem.IsDefinedBy);

          if (Array.isArray(rawItem.IsDefinedBy)) {
            for (const defEntry of rawItem.IsDefinedBy) {
              if (defEntry && typeof defEntry === 'object') {
                extractPsetOrQtoEntries(
                  defEntry as Record<string, unknown>,
                  psetProps,
                  true,
                );
              }
            }
          }

          if (materialNames.size > 0) {
            recordParameter(
              elemParams,
              'attr::__material__',
              DIRECT_ATTR_GROUP,
              'Material',
              Array.from(materialNames),
            );
          }

          if (classifications.length > 0) {
            recordParameter(
              elemParams,
              'attr::__classification__',
              DIRECT_ATTR_GROUP,
              'Clasificación',
              classifications,
            );
          }

          for (const [pKey, pEntry] of psetProps) {
            if (!parameterMeta.has(pKey)) {
              parameterMeta.set(pKey, {
                group: pEntry.group,
                name: pEntry.name,
                values: new Set<string>(),
                count: 0,
              });
            }
            if (pEntry.values.length > 0) {
              recordParameter(
                elemParams,
                pKey,
                pEntry.group,
                pEntry.name,
                pEntry.values,
              );
            }
          }

          elements.push({
            modelId,
            modelName,
            localId: resolvedId,
            category: resolvedCategory,
            typeName,
            name: elementName,
            params: elemParams,
          });
        }
      }
    }

    return {
      modelId,
      elements,
      parameterMeta,
    };
  })();

  buildPromise.catch(() => {
    modelParameterIndexCache.delete(model);
  });

  modelParameterIndexCache.set(model, buildPromise);
  return buildPromise;
}

export function mergeModelParameterIndexes(
  indexes: ModelParameterIndex[],
): ParameterDefinition[] {
  const merged = new Map<
    string,
    { group: string; name: string; values: Set<string>; elementCount: number }
  >();

  for (const idx of indexes) {
    for (const [key, meta] of idx.parameterMeta) {
      let existing = merged.get(key);
      if (!existing) {
        existing = {
          group: meta.group,
          name: meta.name,
          values: new Set<string>(),
          elementCount: 0,
        };
        merged.set(key, existing);
      }
      existing.elementCount += meta.count;
      for (const v of meta.values) {
        existing.values.add(v);
      }
    }
  }

  return Array.from(merged.entries())
    .map(([key, item]) => ({
      key,
      group: item.group,
      name: item.name,
      elementCount: item.elementCount,
      distinctValues: Array.from(item.values).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
      ),
    }))
    .sort((a, b) => {
      if (a.group !== b.group) {
        if (a.group === DIRECT_ATTR_GROUP) return -1;
        if (b.group === DIRECT_ATTR_GROUP) return 1;
        return a.group.localeCompare(b.group, undefined, {
          sensitivity: 'base',
        });
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

function parseStrictNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(trimmed)) return null;
  const num = Number(trimmed.replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

export function valuesEqual(actual: string, target: string): boolean {
  const aTrim = actual.trim();
  const tTrim = target.trim();
  if (aTrim.toLowerCase() === tTrim.toLowerCase()) {
    return true;
  }
  const aNum = parseStrictNumber(aTrim);
  const tNum = parseStrictNumber(tTrim);
  if (aNum !== null && tNum !== null) {
    return Math.abs(aNum - tNum) <= 1e-6;
  }
  return false;
}

export function evaluateSingleCondition(
  rawValues: string[] | undefined,
  condition: FilterCondition,
): boolean {
  const defined = (rawValues ?? []).filter((v) => v.trim().length > 0);
  const { operator, value } = condition;

  switch (operator) {
    case 'is_defined':
      return defined.length > 0;
    case 'is_not_defined':
      return defined.length === 0;
    case 'equals': {
      const target = value.trim();
      return defined.some((v) => valuesEqual(v, target));
    }
    case 'not_equals': {
      const target = value.trim();
      return !defined.some((v) => valuesEqual(v, target));
    }
    case 'contains': {
      const needle = value.trim().toLowerCase();
      return (
        needle.length > 0 &&
        defined.some((v) => v.toLowerCase().includes(needle))
      );
    }
    case 'not_contains': {
      const needle = value.trim().toLowerCase();
      if (!needle) return true;
      return !defined.some((v) => v.toLowerCase().includes(needle));
    }
    case 'starts_with': {
      const prefix = value.trim().toLowerCase();
      return (
        prefix.length > 0 &&
        defined.some((v) => v.toLowerCase().startsWith(prefix))
      );
    }
    case 'ends_with': {
      const suffix = value.trim().toLowerCase();
      return (
        suffix.length > 0 &&
        defined.some((v) => v.toLowerCase().endsWith(suffix))
      );
    }
    case 'one_of': {
      const targets = parseMultiValueList(value);
      if (targets.length === 0) return false;
      return defined.some((v) => targets.some((t) => valuesEqual(v, t)));
    }
    case 'none_of': {
      const targets = parseMultiValueList(value);
      if (targets.length === 0) return true;
      return !defined.some((v) => targets.some((t) => valuesEqual(v, t)));
    }
    default:
      return true;
  }
}

export function evaluateElementAgainstConditions(
  element: IndexedElementRecord,
  conditions: FilterCondition[],
): boolean {
  for (const cond of conditions) {
    if (!isConditionReady(cond)) continue;
    const values = element.params.get(cond.parameterKey);
    if (!evaluateSingleCondition(values, cond)) {
      return false;
    }
  }
  return true;
}
