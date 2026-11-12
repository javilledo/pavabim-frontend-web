import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type * as FRAGS from '@thatopen/fragments';
import { useViewerStore } from '../../store/useViewerStore';
import { useEngine } from '../../viewer/EngineContext';

interface ElementItemEntry {
  modelId: string;
  modelName: string;
  localId: number;
  name: string;
}

interface TypeGroup {
  typeName: string;
  items: ElementItemEntry[];
}

interface ModelCategoryBucket {
  modelId: string;
  modelName: string;
  localIds: number[];
}

interface AggregatedEntityGroup {
  category: string;
  totalCount: number;
  buckets: ModelCategoryBucket[];
  selectionByModel: Record<string, number[]>;
}

interface TreeContextMenuState {
  x: number;
  y: number;
  label: string;
  groupKey: string | null;
  selectionByModel: Record<string, number[]>;
}

const DATA_CHUNK_SIZE = 400;
const INITIAL_VISIBLE_ITEMS = 200;
const DEFAULT_TYPE_LABEL = 'Sin tipo definido';
const CONTEXT_MENU_WIDTH = 176;
const CONTEXT_MENU_HEIGHT = 44;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readAttrValue(attr: unknown): string | null {
  if (attr === null || attr === undefined) return null;
  if (typeof attr === 'object' && 'value' in (attr as Record<string, unknown>)) {
    const val = (attr as Record<string, unknown>).value;
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    return str.length > 0 ? str : null;
  }
  const str = String(attr).trim();
  return str.length > 0 ? str : null;
}

function resolveElementType(item: FRAGS.ItemData): string {
  const isTypedBy = item.IsTypedBy;
  if (Array.isArray(isTypedBy) && isTypedBy.length > 0) {
    const typeObj = isTypedBy[0] as FRAGS.ItemData;
    const typedName =
      readAttrValue(typeObj.Name) ||
      readAttrValue(typeObj.ElementType) ||
      readAttrValue(typeObj.Tag);
    if (typedName) return typedName;
  }

  const objectType = readAttrValue(item.ObjectType);
  if (objectType) return objectType;

  const elementType = readAttrValue(item.ElementType);
  if (elementType) return elementType;

  const predefined = readAttrValue(item.PredefinedType);
  if (
    predefined &&
    predefined !== 'NOTDEFINED' &&
    predefined !== 'USERDEFINED'
  ) {
    return predefined;
  }

  return DEFAULT_TYPE_LABEL;
}

function resolveElementName(
  item: FRAGS.ItemData,
  category: string,
  localId: number,
): string {
  return (
    readAttrValue(item.Name) ||
    readAttrValue(item.Tag) ||
    `${category} #${localId}`
  );
}

function buildTypeKey(category: string, typeName: string): string {
  return `${category}::${typeName}`;
}

function buildSelectionMapFromItems(
  items: ElementItemEntry[],
): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const item of items) {
    if (!map[item.modelId]) {
      map[item.modelId] = [item.localId];
    } else {
      map[item.modelId].push(item.localId);
    }
  }
  return map;
}

export const ElementsTreePanel: React.FC = () => {
  const {
    loadedModels,
    selectedElementId,
    selectedModelId,
    selectedElementsMap,
    hiddenElementsMap,
  } = useViewerStore();
  const { fragments, focusElement, focusSelectionMap, toggleSelectionMap } =
    useEngine();

  const selectedElementKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [modelId, ids] of Object.entries(selectedElementsMap)) {
      for (const id of ids) {
        keys.add(`${modelId}:${id}`);
      }
    }
    return keys;
  }, [selectedElementsMap]);

  const hiddenElementKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [modelId, ids] of Object.entries(hiddenElementsMap)) {
      for (const id of ids) {
        keys.add(`${modelId}:${id}`);
      }
    }
    return keys;
  }, [hiddenElementsMap]);

  const visibleModels = useMemo(
    () => loadedModels.filter((m) => m.visible),
    [loadedModels],
  );

  const visibleModelsKey = useMemo(
    () => visibleModels.map((m) => m.id).join('|'),
    [visibleModels],
  );

  const [entities, setEntities] = useState<AggregatedEntityGroup[]>([]);
  const [isLoadingEntities, setIsLoadingEntities] = useState(false);
  const [filterText, setFilterText] = useState('');

  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(
    new Set(),
  );
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [loadingEntityKeys, setLoadingEntityKeys] = useState<Set<string>>(
    new Set(),
  );
  const [typeGroupsByEntity, setTypeGroupsByEntity] = useState<
    Record<string, TypeGroup[]>
  >({});
  const [expandedItemLimits, setExpandedItemLimits] = useState<
    Record<string, number>
  >({});
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<TreeContextMenuState | null>(
    null,
  );

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-tree-context-menu]')) return;
      closeMenu();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('blur', closeMenu);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('blur', closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    let active = true;

    const loadEntities = async () => {
      const currentVisibleModels = useViewerStore
        .getState()
        .loadedModels.filter((m) => m.visible);

      if (
        !fragments ||
        !fragments.initialized ||
        currentVisibleModels.length === 0
      ) {
        setEntities([]);
        setTypeGroupsByEntity({});
        setExpandedEntities(new Set());
        setExpandedTypes(new Set());
        setLoadingEntityKeys(new Set());
        setExpandedItemLimits({});
        setActiveGroupKey(null);
        setIsLoadingEntities(false);
        return;
      }

      setIsLoadingEntities(true);
      const aggregatedMap = new Map<string, ModelCategoryBucket[]>();

      for (const info of currentVisibleModels) {
        const model = fragments.list.get(info.id);
        if (!model) continue;

        try {
          const geomCategories = await model.getItemsWithGeometryCategories();
          let categories = Array.from(
            new Set(
              geomCategories.filter((cat): cat is string => Boolean(cat)),
            ),
          );

          if (categories.length === 0) {
            const allCategories = await model.getCategories();
            categories = allCategories.filter(
              (cat) => !cat.endsWith('TYPE') && !cat.startsWith('IFCREL'),
            );
          }

          if (categories.length === 0) continue;

          const itemsMap = await model.getItemsOfCategories(
            categories.map((cat) => new RegExp(`^${escapeRegExp(cat)}$`)),
          );

          for (const category of categories) {
            const ids = itemsMap[category];
            if (!ids || ids.length === 0) continue;

            const bucket: ModelCategoryBucket = {
              modelId: info.id,
              modelName: info.name,
              localIds: ids,
            };

            const existing = aggregatedMap.get(category);
            if (existing) {
              existing.push(bucket);
            } else {
              aggregatedMap.set(category, [bucket]);
            }
          }
        } catch (err) {
          console.warn(
            `[ElementsTreePanel] Could not read entities for ${info.name}:`,
            err,
          );
        }
      }

      if (!active) return;

      const nextEntities: AggregatedEntityGroup[] = Array.from(
        aggregatedMap.entries(),
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, buckets]) => {
          const selectionByModel: Record<string, number[]> = {};
          let totalCount = 0;

          for (const bucket of buckets) {
            selectionByModel[bucket.modelId] = bucket.localIds;
            totalCount += bucket.localIds.length;
          }

          return {
            category,
            totalCount,
            buckets,
            selectionByModel,
          };
        });

      setEntities(nextEntities);
      setTypeGroupsByEntity({});
      setExpandedEntities(new Set());
      setExpandedTypes(new Set());
      setLoadingEntityKeys(new Set());
      setExpandedItemLimits({});
      setActiveGroupKey(null);
      setIsLoadingEntities(false);
    };

    void loadEntities();

    return () => {
      active = false;
    };
  }, [fragments, visibleModelsKey]);

  const loadEntityTypes = useCallback(
    async (entity: AggregatedEntityGroup) => {
      const entityKey = entity.category;
      if (typeGroupsByEntity[entityKey] || loadingEntityKeys.has(entityKey)) {
        return;
      }
      if (!fragments) return;

      setLoadingEntityKeys((prev) => new Set(prev).add(entityKey));

      try {
        const grouped = new Map<string, ElementItemEntry[]>();

        for (const bucket of entity.buckets) {
          const model = fragments.list.get(bucket.modelId);
          if (!model) continue;

          for (let i = 0; i < bucket.localIds.length; i += DATA_CHUNK_SIZE) {
            const chunkIds = bucket.localIds.slice(i, i + DATA_CHUNK_SIZE);
            const itemsData = await model.getItemsData(chunkIds, {
              attributesDefault: true,
              relations: {
                IsTypedBy: { attributes: true, relations: false },
              },
            });

            for (let j = 0; j < chunkIds.length; j++) {
              const fallbackId = chunkIds[j];
              const data = itemsData[j];
              if (!data) continue;

              const rawId = readAttrValue(data._localId);
              const localId = rawId !== null ? Number(rawId) : fallbackId;
              const resolvedId = Number.isFinite(localId) ? localId : fallbackId;

              const typeName = resolveElementType(data);
              const name = resolveElementName(data, entity.category, resolvedId);

              const entry: ElementItemEntry = {
                modelId: bucket.modelId,
                modelName: bucket.modelName,
                localId: resolvedId,
                name,
              };

              const list = grouped.get(typeName);
              if (list) {
                list.push(entry);
              } else {
                grouped.set(typeName, [entry]);
              }
            }
          }
        }

        const sortedGroups: TypeGroup[] = Array.from(grouped.entries())
          .sort(([a], [b]) => {
            if (a === DEFAULT_TYPE_LABEL) return 1;
            if (b === DEFAULT_TYPE_LABEL) return -1;
            return a.localeCompare(b);
          })
          .map(([typeName, items]) => ({
            typeName,
            items: items.sort(
              (a, b) =>
                a.name.localeCompare(b.name) ||
                a.modelName.localeCompare(b.modelName),
            ),
          }));

        setTypeGroupsByEntity((prev) => ({
          ...prev,
          [entityKey]: sortedGroups,
        }));
      } catch (err) {
        console.warn(
          `[ElementsTreePanel] Could not load types for ${entity.category}:`,
          err,
        );
      } finally {
        setLoadingEntityKeys((prev) => {
          const next = new Set(prev);
          next.delete(entityKey);
          return next;
        });
      }
    },
    [fragments, loadingEntityKeys, typeGroupsByEntity],
  );

  const toggleEntityExpand = useCallback(
    (entity: AggregatedEntityGroup) => {
      const entityKey = entity.category;
      const willExpand = !expandedEntities.has(entityKey);

      setExpandedEntities((prev) => {
        const next = new Set(prev);
        if (willExpand) {
          next.add(entityKey);
        } else {
          next.delete(entityKey);
        }
        return next;
      });

      if (willExpand) {
        void loadEntityTypes(entity);
      }
    },
    [expandedEntities, loadEntityTypes],
  );

  const handleEntityRowClick = useCallback(
    (e: React.MouseEvent, entity: AggregatedEntityGroup) => {
      const entityKey = entity.category;
      if (e.ctrlKey || e.metaKey) {
        setActiveGroupKey(null);
        void toggleSelectionMap(entity.selectionByModel, false);
        return;
      }
      setActiveGroupKey(entityKey);
      if (!expandedEntities.has(entityKey)) {
        toggleEntityExpand(entity);
      }
      void focusSelectionMap(entity.selectionByModel, false);
    },
    [expandedEntities, focusSelectionMap, toggleEntityExpand, toggleSelectionMap],
  );

  const toggleTypeExpand = useCallback((typeKey: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeKey)) {
        next.delete(typeKey);
      } else {
        next.add(typeKey);
      }
      return next;
    });
  }, []);

  const handleTypeRowClick = useCallback(
    (e: React.MouseEvent, typeKey: string, items: ElementItemEntry[]) => {
      const selectionMap = buildSelectionMapFromItems(items);
      if (e.ctrlKey || e.metaKey) {
        setActiveGroupKey(null);
        void toggleSelectionMap(selectionMap, false);
        return;
      }
      setActiveGroupKey(typeKey);
      void focusSelectionMap(selectionMap, false);
    },
    [focusSelectionMap, toggleSelectionMap],
  );

  const openContextMenu = useCallback(
    (
      e: React.MouseEvent,
      target: {
        label: string;
        groupKey: string | null;
        selectionByModel: Record<string, number[]>;
      },
    ) => {
      e.preventDefault();
      e.stopPropagation();

      if (Object.keys(target.selectionByModel).length === 0) return;

      setActiveGroupKey(target.groupKey);
      void focusSelectionMap(target.selectionByModel, false);

      const maxX = Math.max(8, window.innerWidth - CONTEXT_MENU_WIDTH - 8);
      const maxY = Math.max(8, window.innerHeight - CONTEXT_MENU_HEIGHT - 8);
      setContextMenu({
        x: Math.min(Math.max(8, e.clientX), maxX),
        y: Math.min(Math.max(8, e.clientY), maxY),
        label: target.label,
        groupKey: target.groupKey,
        selectionByModel: target.selectionByModel,
      });
    },
    [focusSelectionMap],
  );

  const handleZoomToContextTarget = useCallback(() => {
    if (!contextMenu) return;
    const target = contextMenu;
    setContextMenu(null);
    setActiveGroupKey(target.groupKey);
    void focusSelectionMap(target.selectionByModel, true);
  }, [contextMenu, focusSelectionMap]);

  if (loadedModels.length === 0) {
    return (
      <div className="rounded border border-asphalt-800 bg-asphalt-950/50 p-3 text-center text-[11px] text-asphalt-400 leading-relaxed">
        Carga al menos un modelo desde la pestaña{' '}
        <span className="text-pavasal-400 font-medium">Modelos</span> o con{' '}
        <span className="text-pavasal-400 font-medium">+ .frag / .ifc local</span>{' '}
        para inspeccionar sus entidades IFC y tipos.
      </div>
    );
  }

  if (visibleModels.length === 0) {
    return (
      <div className="rounded border border-asphalt-800 bg-asphalt-950/50 p-3 text-center text-[11px] text-asphalt-400 leading-relaxed">
        Todos los modelos cargados están ocultos. Activa la visibilidad en{' '}
        <span className="text-pavasal-400 font-medium">Modelos</span> para
        analizar sus elementos.
      </div>
    );
  }

  if (isLoadingEntities) {
    return (
      <div className="text-center text-xs text-asphalt-300 mt-8">
        <p>Clasificando entidades IFC...</p>
      </div>
    );
  }

  const normalizedFilter = filterText.trim().toLowerCase();
  const filteredEntities = entities.filter((entity) => {
    if (!normalizedFilter) return true;
    if (entity.category.toLowerCase().includes(normalizedFilter)) {
      return true;
    }
    const loadedTypes = typeGroupsByEntity[entity.category];
    return Boolean(
      loadedTypes?.some(
        (t) =>
          t.typeName.toLowerCase().includes(normalizedFilter) ||
          t.items.some((i) =>
            i.name.toLowerCase().includes(normalizedFilter),
          ),
      ),
    );
  });

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2 text-[10px] text-asphalt-400 px-0.5">
        <span>
          {visibleModels.length === 1
            ? `1 modelo mostrado`
            : `${visibleModels.length} modelos mostrados`}
        </span>
        <span className="font-mono">{entities.length} entidades</span>
      </div>

      <input
        type="search"
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        placeholder="Filtrar IfcEntity o tipo..."
        className="w-full rounded border border-asphalt-700 bg-asphalt-950 px-2.5 py-1.5 text-[11px] text-asphalt-100 placeholder-asphalt-500 focus:border-pavasal-500 focus:outline-none"
      />

      {entities.length === 0 ? (
        <p className="text-center text-asphalt-400 py-4 text-[11px]">
          No se encontraron entidades IFC con geometría en los modelos mostrados.
        </p>
      ) : filteredEntities.length === 0 ? (
        <p className="text-center text-asphalt-400 py-4 text-[11px]">
          No hay entidades o tipos que coincidan con el filtro.
        </p>
      ) : (
        <div className="space-y-1">
          {filteredEntities.map((entity) => {
            const entityKey = entity.category;
            const isEntityExpanded = expandedEntities.has(entityKey);
            const isLoadingTypes = loadingEntityKeys.has(entityKey);
            const typeGroups = typeGroupsByEntity[entityKey];
            const isEntitySelected = activeGroupKey === entityKey;

            const visibleTypeGroups =
              typeGroups?.filter((t) => {
                if (!normalizedFilter) return true;
                if (
                  entity.category.toLowerCase().includes(normalizedFilter) ||
                  t.typeName.toLowerCase().includes(normalizedFilter)
                ) {
                  return true;
                }
                return t.items.some((i) =>
                  i.name.toLowerCase().includes(normalizedFilter),
                );
              }) || [];

            return (
              <div key={entityKey}>
                <div
                  onClick={(e) => handleEntityRowClick(e, entity)}
                  onContextMenu={(e) =>
                    openContextMenu(e, {
                      label: entity.category,
                      groupKey: entityKey,
                      selectionByModel: entity.selectionByModel,
                    })
                  }
                  className={`flex items-center justify-between gap-1.5 px-1.5 py-1 rounded cursor-pointer select-none transition-colors ${
                    isEntitySelected
                      ? 'bg-pavasal-500/20 text-pavasal-300 border border-pavasal-500/50 font-semibold'
                      : 'text-asphalt-100 hover:bg-asphalt-800/80'
                  }`}
                  title={`${entity.category} (${entity.totalCount} elementos) — clic para seleccionar, Ctrl+clic para multiselección`}
                >
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEntityExpand(entity);
                      }}
                      className="w-4 h-4 flex items-center justify-center text-asphalt-400 hover:text-pavasal-400 shrink-0"
                      aria-label={
                        isEntityExpanded
                          ? `Contraer ${entity.category}`
                          : `Expandir ${entity.category}`
                      }
                    >
                      {isEntityExpanded ? '▾' : '▸'}
                    </button>
                    <span className="truncate font-medium text-[11px]">
                      {entity.category}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-asphalt-400 shrink-0">
                    {entity.totalCount}
                  </span>
                </div>

                {isEntityExpanded && (
                  <div className="pl-3 mt-0.5 space-y-0.5 border-l border-asphalt-800 ml-2.5">
                    {isLoadingTypes ? (
                      <div className="py-1 pl-2 text-[11px] text-asphalt-400">
                        Cargando tipos...
                      </div>
                    ) : visibleTypeGroups.length === 0 ? (
                      <div className="py-1 pl-2 text-[11px] text-asphalt-500">
                        Sin tipos coincidentes
                      </div>
                    ) : (
                      visibleTypeGroups.map((typeGroup) => {
                        const typeKey = buildTypeKey(
                          entity.category,
                          typeGroup.typeName,
                        );
                        const isTypeExpanded = expandedTypes.has(typeKey);
                        const isTypeSelected = activeGroupKey === typeKey;

                        const filteredItems =
                          !normalizedFilter ||
                          entity.category
                            .toLowerCase()
                            .includes(normalizedFilter) ||
                          typeGroup.typeName
                            .toLowerCase()
                            .includes(normalizedFilter)
                            ? typeGroup.items
                            : typeGroup.items.filter((item) =>
                                item.name
                                  .toLowerCase()
                                  .includes(normalizedFilter),
                              );

                        const limit =
                          expandedItemLimits[typeKey] ?? INITIAL_VISIBLE_ITEMS;
                        const visibleItems = filteredItems.slice(0, limit);
                        const remainingCount =
                          filteredItems.length - visibleItems.length;

                        return (
                          <div key={typeKey}>
                            <div
                              onClick={(e) =>
                                handleTypeRowClick(e, typeKey, filteredItems)
                              }
                              onDoubleClick={() => toggleTypeExpand(typeKey)}
                              onContextMenu={(e) =>
                                openContextMenu(e, {
                                  label: typeGroup.typeName,
                                  groupKey: typeKey,
                                  selectionByModel:
                                    buildSelectionMapFromItems(filteredItems),
                                })
                              }
                              className={`flex items-center justify-between gap-1.5 px-1.5 py-1 rounded cursor-pointer select-none transition-colors ${
                                isTypeSelected
                                  ? 'bg-pavasal-500/20 text-pavasal-300 border border-pavasal-500/50 font-medium'
                                  : 'text-asphalt-200 hover:bg-asphalt-800/70'
                              }`}
                              title={`${typeGroup.typeName} (${filteredItems.length}) — clic para seleccionar, Ctrl+clic multiselección, doble clic para desplegar`}
                            >
                              <div className="flex items-center gap-1 min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTypeExpand(typeKey);
                                  }}
                                  onDoubleClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 flex items-center justify-center text-asphalt-400 hover:text-pavasal-400 shrink-0"
                                  aria-label={
                                    isTypeExpanded
                                      ? `Contraer ${typeGroup.typeName}`
                                      : `Expandir ${typeGroup.typeName}`
                                  }
                                >
                                  {isTypeExpanded ? '▾' : '▸'}
                                </button>
                                <span className="truncate text-[11px]">
                                  {typeGroup.typeName}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-asphalt-400 shrink-0">
                                {filteredItems.length}
                              </span>
                            </div>

                            {isTypeExpanded && (
                              <div className="pl-3 mt-0.5 space-y-0.5 border-l border-asphalt-800/70 ml-2.5">
                                {visibleItems.map((el) => {
                                  const elKey = `${el.modelId}:${el.localId}`;
                                  const isSelected =
                                    selectedElementKeys.has(elKey) ||
                                    (selectedModelId === el.modelId &&
                                      selectedElementId === String(el.localId));
                                  const isHidden = hiddenElementKeys.has(elKey);

                                  return (
                                    <div
                                      key={`${el.modelId}-${el.localId}`}
                                      onClick={(e) => {
                                        setActiveGroupKey(null);
                                        if (e.ctrlKey || e.metaKey) {
                                          void toggleSelectionMap(
                                            { [el.modelId]: [el.localId] },
                                            false,
                                          );
                                          return;
                                        }
                                        void focusElement(
                                          el.modelId,
                                          el.localId,
                                        );
                                      }}
                                      onContextMenu={(e) =>
                                        openContextMenu(e, {
                                          label: el.name,
                                          groupKey: null,
                                          selectionByModel: {
                                            [el.modelId]: [el.localId],
                                          },
                                        })
                                      }
                                      className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded cursor-pointer select-none transition-colors ${
                                        isSelected
                                          ? 'bg-pavasal-500/20 text-pavasal-400 border border-pavasal-500/50 font-medium'
                                          : isHidden
                                            ? 'text-asphalt-500 opacity-60 hover:bg-asphalt-800/60 hover:text-asphalt-300'
                                            : 'text-asphalt-300 hover:bg-asphalt-800/60 hover:text-white'
                                      }`}
                                      title={`${el.name} (#${el.localId}) · ${el.modelName}${isHidden ? ' · Oculto' : ''} — Ctrl+clic para multiselección`}
                                    >
                                      <span
                                        className={`truncate text-[11px] ${
                                          isHidden ? 'line-through' : ''
                                        }`}
                                      >
                                        {el.name}
                                      </span>
                                      <span className="text-[10px] font-mono text-asphalt-500 shrink-0">
                                        {isHidden ? 'oculto · ' : ''}#{el.localId}
                                      </span>
                                    </div>
                                  );
                                })}

                                {remainingCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedItemLimits((prev) => ({
                                        ...prev,
                                        [typeKey]:
                                          limit + INITIAL_VISIBLE_ITEMS,
                                      }))
                                    }
                                    className="w-full text-left px-2 py-1 text-[10px] text-pavasal-400 hover:text-pavasal-300"
                                  >
                                    Mostrar más ({remainingCount} restantes)...
                                  </button>
                                )}
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
          })}
        </div>
      )}

      {contextMenu && (
        <div
          data-tree-context-menu
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y, width: CONTEXT_MENU_WIDTH }}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-50 rounded-md border border-asphalt-700 bg-asphalt-900/95 p-1 shadow-xl backdrop-blur-sm"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleZoomToContextTarget}
            title={`Hacer zoom a ${contextMenu.label}`}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-medium text-asphalt-100 transition-colors hover:bg-pavasal-500/20 hover:text-pavasal-300"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0 text-pavasal-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" />
              <path d="M11 8v6M8 11h6" />
            </svg>
            <span>Zoom a objeto</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ElementsTreePanel;
