import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useViewerStore,
  type ElementAppearanceOverride,
} from '../store/useViewerStore';
import {
  buildColorByParameterGroups,
  extractVisibleParameterDefinitions,
  loadVisibleModelsIndexesAndVisibility,
} from '../utils/colorByParameter';
import type { ModelParameterIndex } from '../utils/elementParameterFilter';
import { useEngine } from '../viewer/EngineContext';

interface IndexedVisibleSnapshot {
  indexes: ModelParameterIndex[];
  visibilityByModel: Map<string, Set<number> | null>;
}

export function useColorByParameterSync(): void {
  const {
    loadedModels,
    hiddenElementsMap,
    isIsolationActive,
    isolationRevision,
    colorByParameterKey,
    colorByParameterCustomColors,
    setColorByParameterState,
  } = useViewerStore();

  const { fragments, isEngineReady, applyCustomAppearancesMap } = useEngine();

  const [snapshot, setSnapshot] = useState<IndexedVisibleSnapshot | null>(null);
  const wasActiveRef = useRef(false);

  const visibleModels = useMemo(
    () => loadedModels.filter((m) => m.visible),
    [loadedModels],
  );

  const visibleModelsKey = useMemo(
    () => visibleModels.map((m) => m.id).join('|'),
    [visibleModels],
  );

  const hiddenElementsKey = useMemo(() => {
    const parts: string[] = [];
    for (const [modelId, ids] of Object.entries(hiddenElementsMap)) {
      if (ids && ids.length > 0) {
        parts.push(`${modelId}:${ids.length}:${ids[0]}:${ids[ids.length - 1]}`);
      }
    }
    return parts.sort().join('|');
  }, [hiddenElementsMap]);

  const hasHiddenOrIsolated =
    isIsolationActive || hiddenElementsKey.length > 0;

  // 1. Index visible models & resolve currently shown elements on screen
  useEffect(() => {
    let active = true;

    if (
      !isEngineReady ||
      !fragments ||
      !fragments.initialized ||
      visibleModels.length === 0
    ) {
      setSnapshot(null);
      setColorByParameterState({
        availableParams: [],
        groups: [],
        isIndexing: false,
      });
      return () => {
        active = false;
      };
    }

    const syncVisibleParameters = async () => {
      setColorByParameterState({ isIndexing: true });
      try {
        const currentVisible = useViewerStore
          .getState()
          .loadedModels.filter((m) => m.visible)
          .map((m) => ({ id: m.id, name: m.name }));

        const result = await loadVisibleModelsIndexesAndVisibility(
          fragments,
          currentVisible,
          hasHiddenOrIsolated,
        );
        if (!active) return;

        const availableParams = extractVisibleParameterDefinitions(
          result.indexes,
          result.visibilityByModel,
        );

        setSnapshot(result);
        setColorByParameterState({
          availableParams,
          isIndexing: false,
        });
      } catch (err) {
        console.warn(
          '[useColorByParameterSync] Failed indexing visible parameters:',
          err,
        );
        if (active) {
          setColorByParameterState({ isIndexing: false });
        }
      }
    };

    void syncVisibleParameters();

    return () => {
      active = false;
    };
  }, [
    fragments,
    hasHiddenOrIsolated,
    hiddenElementsKey,
    isEngineReady,
    isolationRevision,
    setColorByParameterState,
    visibleModels.length,
    visibleModelsKey,
  ]);

  const activeCustomColors = colorByParameterKey
    ? colorByParameterCustomColors[colorByParameterKey]
    : undefined;

  // 2. Compute value groups & apply 3D colors immediately in memory
  useEffect(() => {
    if (!isEngineReady) return;

    if (!colorByParameterKey) {
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        const currentMap = useViewerStore.getState().customAppearancesMap;
        const strippedMap: Record<
          string,
          Record<number, ElementAppearanceOverride>
        > = {};
        let hadColors = false;

        for (const [modelId, overrides] of Object.entries(currentMap)) {
          if (!overrides) continue;
          const nextModelOverrides: Record<number, ElementAppearanceOverride> =
            {};
          for (const [rawId, ov] of Object.entries(overrides)) {
            if (ov.color) hadColors = true;
            if (ov.opacity !== undefined) {
              nextModelOverrides[Number(rawId)] = { opacity: ov.opacity };
            }
          }
          if (Object.keys(nextModelOverrides).length > 0) {
            strippedMap[modelId] = nextModelOverrides;
          }
        }

        if (hadColors) {
          void applyCustomAppearancesMap(strippedMap, false);
        }
      }
      return;
    }

    if (!snapshot || snapshot.indexes.length === 0) {
      setColorByParameterState({ groups: [] });
      return;
    }

    wasActiveRef.current = true;

    const groups = buildColorByParameterGroups(
      snapshot.indexes,
      snapshot.visibilityByModel,
      colorByParameterKey,
      activeCustomColors,
    );

    setColorByParameterState({ groups });

    const prevAppearances = useViewerStore.getState().customAppearancesMap;
    const nextAppearances: Record<
      string,
      Record<number, ElementAppearanceOverride>
    > = {};

    // Preserve any existing opacity overrides while clearing stale parameter colors
    for (const [modelId, overrides] of Object.entries(prevAppearances)) {
      if (!overrides) continue;
      const kept: Record<number, ElementAppearanceOverride> = {};
      for (const [rawId, ov] of Object.entries(overrides)) {
        if (ov.opacity !== undefined) {
          kept[Number(rawId)] = { opacity: ov.opacity };
        }
      }
      if (Object.keys(kept).length > 0) {
        nextAppearances[modelId] = kept;
      }
    }

    // Assign group colors to all currently shown elements on screen
    for (const group of groups) {
      for (const [modelId, localIds] of Object.entries(group.selectionByModel)) {
        if (!localIds || localIds.length === 0) continue;
        const modelOverrides = nextAppearances[modelId] ?? {};
        for (const id of localIds) {
          const prevOpacity = modelOverrides[id]?.opacity;
          modelOverrides[id] =
            prevOpacity !== undefined
              ? { color: group.color, opacity: prevOpacity }
              : { color: group.color };
        }
        nextAppearances[modelId] = modelOverrides;
      }
    }

    void applyCustomAppearancesMap(nextAppearances, true);
  }, [
    activeCustomColors,
    applyCustomAppearancesMap,
    colorByParameterKey,
    isEngineReady,
    setColorByParameterState,
    snapshot,
  ]);
}
