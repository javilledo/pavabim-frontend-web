import { create } from 'zustand';
import type { ModelStatusResponse, ProjectWithRole } from '../types/api.types';
import type { CameraViewpointData } from '../types/bcf.types';
import type { ColorParameterGroup } from '../utils/colorByParameter';
import type { ParameterDefinition } from '../utils/elementParameterFilter';

export type ActiveTool =
  | 'orbit'
  | 'select'
  | 'pan'
  | 'measure'
  | 'section'
  | 'coordinates';
export type MeasureMode = 'length' | 'area' | 'volume' | 'coordinates';
export type CameraProjectionMode = 'Perspective' | 'Orthographic';
export type ThemeMode = 'dark' | 'light';

export function getSystemThemeMode(): ThemeMode {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  ) {
    return 'light';
  }
  return 'dark';
}

export function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

const initialThemeMode = getSystemThemeMode();
applyThemeToDocument(initialThemeMode);

export interface LoadedModel {
  id: string;
  name: string;
  visible: boolean;
  userVisible?: boolean;
  source?: 'local' | 'remote';
  ifcFileId?: string;
  fragModifiedTime?: string;
  projectId?: string;
  downloadUrl?: string;
}

export interface LocalViewpoint {
  id: string;
  title: string;
  createdAt: string;
  camera: CameraViewpointData;
  snapshotDataUrl?: string;
}

if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('pavabim_active_project_id');
  } catch {
    // Ignore storage quota or sandbox restrictions
  }
}

export interface ElementAppearanceOverride {
  color?: string;
  opacity?: number;
}

function countCustomAppearances(
  map: Record<string, Record<number, ElementAppearanceOverride>>,
): number {
  let count = 0;
  for (const overrides of Object.values(map)) {
    if (overrides) {
      count += Object.keys(overrides).length;
    }
  }
  return count;
}

interface ViewerState {
  // Navigation & Viewer Tools
  activeTool: ActiveTool;
  measureMode: MeasureMode;
  cameraProjection: CameraProjectionMode;
  isGridVisible: boolean;
  isSectionActive: boolean;
  isSectionGizmosVisible: boolean;
  themeMode: ThemeMode;

  // 3D Loaded Models & Standalone Loading State
  loadedModels: LoadedModel[];
  isLoadingModel: boolean;
  loadingModelName: string | null;
  viewerToastError: string | null;
  selectedElementId: string | null;
  selectedModelId: string | null;
  selectedElementProperties: Record<string, unknown> | null;
  selectedElementsMap: Record<string, number[]>;
  hiddenElementsMap: Record<string, number[]>;
  customAppearancesMap: Record<string, Record<number, ElementAppearanceOverride>>;
  customAppearanceCount: number;
  isIsolationActive: boolean;
  isolationRevision: number;
  colorByParameterKey: string | null;
  colorByParameterCustomColors: Record<string, Record<string, string>>;
  colorByParameterAvailableParams: ParameterDefinition[];
  colorByParameterGroups: ColorParameterGroup[];
  isColorByParameterIndexing: boolean;
  localViewpoints: LocalViewpoint[];

  // Backend Project & BCF Context
  projects: ProjectWithRole[];
  currentProjectId: string | null;
  currentProject: ProjectWithRole | null;
  remoteModels: ModelStatusResponse[];
  activeBcfTopicId: string | null;

  // Actions
  setActiveTool: (tool: ActiveTool) => void;
  setMeasureMode: (mode: MeasureMode) => void;
  setCameraProjection: (projection: CameraProjectionMode) => void;
  toggleGrid: () => void;
  toggleSection: () => void;
  setSectionActive: (active: boolean) => void;
  setSectionGizmosVisible: (visible: boolean) => void;
  setThemeMode: (theme: ThemeMode) => void;
  toggleThemeMode: () => void;
  setModelLoading: (loading: boolean, modelName?: string | null) => void;
  setViewerToastError: (error: string | null) => void;
  addLoadedModel: (model: LoadedModel) => void;
  removeLoadedModel: (modelId: string) => void;
  clearLoadedModels: () => void;
  toggleModelVisibility: (modelId: string) => void;
  setModelVisibility: (modelId: string, visible: boolean) => void;
  showAllModels: () => void;
  setSelectedElement: (
    elementId: string | null,
    modelId: string | null,
    properties?: Record<string, unknown> | null,
  ) => void;
  setSelectedElements: (
    selection: Record<string, number[]>,
    primaryElementId?: string | null,
    primaryModelId?: string | null,
    properties?: Record<string, unknown> | null,
  ) => void;
  addHiddenElements: (items: Record<string, number[]>) => void;
  removeHiddenElements: (items: Record<string, number[]>) => void;
  setIsolationActive: (active: boolean) => void;
  clearHiddenElements: () => void;
  setCustomAppearances: (
    map: Record<string, Record<number, ElementAppearanceOverride>>,
  ) => void;
  clearCustomAppearances: () => void;
  setColorByParameterKey: (parameterKey: string | null) => void;
  setColorByParameterGroupColor: (
    parameterKey: string,
    valueKey: string,
    hexColor: string,
  ) => void;
  resetColorByParameterColors: (parameterKey: string) => void;
  setColorByParameterState: (patch: {
    availableParams?: ParameterDefinition[];
    groups?: ColorParameterGroup[];
    isIndexing?: boolean;
  }) => void;
  addLocalViewpoint: (vp: LocalViewpoint) => void;
  removeLocalViewpoint: (id: string) => void;

  setProjects: (projects: ProjectWithRole[]) => void;
  setCurrentProject: (project: ProjectWithRole | null) => void;
  setCurrentProjectById: (projectId: string | null) => void;
  setRemoteModels: (models: ModelStatusResponse[]) => void;
  setActiveBcfTopicId: (topicId: string | null) => void;
  resetProjectContext: () => void;
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  activeTool: 'select',
  measureMode: 'length',
  cameraProjection: 'Perspective',
  isGridVisible: true,
  isSectionActive: false,
  isSectionGizmosVisible: true,
  themeMode: initialThemeMode,

  loadedModels: [],
  isLoadingModel: false,
  loadingModelName: null,
  viewerToastError: null,
  selectedElementId: null,
  selectedModelId: null,
  selectedElementProperties: null,
  selectedElementsMap: {},
  hiddenElementsMap: {},
  customAppearancesMap: {},
  customAppearanceCount: 0,
  isIsolationActive: false,
  isolationRevision: 0,
  colorByParameterKey: null,
  colorByParameterCustomColors: {},
  colorByParameterAvailableParams: [],
  colorByParameterGroups: [],
  isColorByParameterIndexing: false,
  localViewpoints: [],

  projects: [],
  currentProjectId: null,
  currentProject: null,
  remoteModels: [],
  activeBcfTopicId: null,

  setActiveTool: (tool) => set({ activeTool: tool }),

  setMeasureMode: (measureMode) => set({ measureMode }),

  setCameraProjection: (cameraProjection) => set({ cameraProjection }),

  toggleGrid: () => set((state) => ({ isGridVisible: !state.isGridVisible })),

  toggleSection: () =>
    set((state) => ({ isSectionActive: !state.isSectionActive })),

  setSectionActive: (isSectionActive) => set({ isSectionActive }),

  setSectionGizmosVisible: (isSectionGizmosVisible) =>
    set({ isSectionGizmosVisible }),

  setThemeMode: (themeMode) => {
    applyThemeToDocument(themeMode);
    set({ themeMode });
  },

  toggleThemeMode: () =>
    set((state) => {
      const nextTheme: ThemeMode = state.themeMode === 'dark' ? 'light' : 'dark';
      applyThemeToDocument(nextTheme);
      return { themeMode: nextTheme };
    }),

  setModelLoading: (isLoadingModel, loadingModelName = null) =>
    set({ isLoadingModel, loadingModelName }),

  setViewerToastError: (viewerToastError) => set({ viewerToastError }),

  addLoadedModel: (model) =>
    set((state) => {
      const userVisible = model.userVisible ?? model.visible;
      const modelWithUserVisible = { ...model, userVisible };
      const exists = state.loadedModels.some((m) => m.id === model.id);
      if (exists) {
        return {
          loadedModels: state.loadedModels.map((m) =>
            m.id === model.id ? { ...m, ...modelWithUserVisible } : m,
          ),
        };
      }
      return { loadedModels: [...state.loadedModels, modelWithUserVisible] };
    }),

  removeLoadedModel: (modelId) =>
    set((state) => {
      const target = state.loadedModels.find((m) => m.id === modelId);
      if (target?.downloadUrl) {
        URL.revokeObjectURL(target.downloadUrl);
      }
      const nextSelection = { ...state.selectedElementsMap };
      delete nextSelection[modelId];
      const nextHidden = { ...state.hiddenElementsMap };
      delete nextHidden[modelId];
      const nextAppearances = { ...state.customAppearancesMap };
      delete nextAppearances[modelId];
      return {
        loadedModels: state.loadedModels.filter((m) => m.id !== modelId),
        selectedElementsMap: nextSelection,
        hiddenElementsMap: nextHidden,
        customAppearancesMap: nextAppearances,
        customAppearanceCount: countCustomAppearances(nextAppearances),
        selectedElementId:
          state.selectedModelId === modelId ? null : state.selectedElementId,
        selectedModelId:
          state.selectedModelId === modelId ? null : state.selectedModelId,
        selectedElementProperties:
          state.selectedModelId === modelId
            ? null
            : state.selectedElementProperties,
      };
    }),

  clearLoadedModels: () =>
    set((state) => {
      for (const m of state.loadedModels) {
        if (m.downloadUrl) {
          URL.revokeObjectURL(m.downloadUrl);
        }
      }
      return {
        loadedModels: [],
        selectedElementsMap: {},
        hiddenElementsMap: {},
        customAppearancesMap: {},
        customAppearanceCount: 0,
        isIsolationActive: false,
        isolationRevision: 0,
        colorByParameterKey: null,
        colorByParameterCustomColors: {},
        colorByParameterAvailableParams: [],
        colorByParameterGroups: [],
        isColorByParameterIndexing: false,
        selectedElementId: null,
        selectedModelId: null,
        selectedElementProperties: null,
      };
    }),

  toggleModelVisibility: (modelId) =>
    set((state) => ({
      loadedModels: state.loadedModels.map((m) => {
        if (m.id !== modelId) return m;
        const nextVisible = !m.visible;
        return {
          ...m,
          visible: nextVisible,
          userVisible: nextVisible,
        };
      }),
    })),

  setModelVisibility: (modelId, visible) =>
    set((state) => ({
      loadedModels: state.loadedModels.map((m) =>
        m.id === modelId
          ? {
              ...m,
              visible,
              userVisible: visible,
            }
          : m,
      ),
    })),

  showAllModels: () =>
    set((state) => {
      const currentProjId = state.currentProjectId;
      return {
        loadedModels: state.loadedModels.map((m) => {
          const belongsToCurrent =
            !m.projectId || m.projectId === currentProjId;
          if (!belongsToCurrent) return m;
          return { ...m, visible: true, userVisible: true };
        }),
      };
    }),

  setSelectedElement: (elementId, modelId, properties = null) => {
    const parsedId = elementId !== null ? Number(elementId) : NaN;
    const nextMap: Record<string, number[]> =
      elementId && modelId && Number.isFinite(parsedId)
        ? { [modelId]: [parsedId] }
        : {};
    set({
      selectedElementId: elementId,
      selectedModelId: modelId,
      selectedElementProperties: properties,
      selectedElementsMap: nextMap,
    });
  },

  setSelectedElements: (
    selection,
    primaryElementId = null,
    primaryModelId = null,
    properties = null,
  ) =>
    set({
      selectedElementsMap: selection,
      selectedElementId: primaryElementId,
      selectedModelId: primaryModelId,
      selectedElementProperties: properties,
    }),

  addHiddenElements: (items) =>
    set((state) => {
      const nextHidden: Record<string, number[]> = { ...state.hiddenElementsMap };
      for (const [modelId, ids] of Object.entries(items)) {
        if (!ids || ids.length === 0) continue;
        const merged = new Set(nextHidden[modelId] ?? []);
        for (const id of ids) merged.add(id);
        nextHidden[modelId] = Array.from(merged);
      }
      return { hiddenElementsMap: nextHidden };
    }),

  removeHiddenElements: (items) =>
    set((state) => {
      const nextHidden: Record<string, number[]> = { ...state.hiddenElementsMap };
      for (const [modelId, ids] of Object.entries(items)) {
        if (!ids || ids.length === 0 || !nextHidden[modelId]) continue;
        const currentSet = new Set(nextHidden[modelId]);
        for (const id of ids) currentSet.delete(id);
        if (currentSet.size === 0) {
          delete nextHidden[modelId];
        } else {
          nextHidden[modelId] = Array.from(currentSet);
        }
      }
      return { hiddenElementsMap: nextHidden };
    }),

  setIsolationActive: (isIsolationActive) =>
    set((state) => ({
      isIsolationActive,
      isolationRevision: isIsolationActive ? state.isolationRevision + 1 : 0,
    })),

  clearHiddenElements: () =>
    set({
      hiddenElementsMap: {},
      isIsolationActive: false,
      isolationRevision: 0,
    }),

  setCustomAppearances: (customAppearancesMap) =>
    set({
      customAppearancesMap,
      customAppearanceCount: countCustomAppearances(customAppearancesMap),
    }),

  clearCustomAppearances: () =>
    set({
      customAppearancesMap: {},
      customAppearanceCount: 0,
      colorByParameterKey: null,
      colorByParameterGroups: [],
    }),

  setColorByParameterKey: (colorByParameterKey) =>
    set((state) => ({
      colorByParameterKey,
      ...(colorByParameterKey === null ? { colorByParameterGroups: [] } : {}),
      ...(colorByParameterKey !== state.colorByParameterKey &&
      colorByParameterKey !== null
        ? { colorByParameterGroups: [] }
        : {}),
    })),

  setColorByParameterGroupColor: (parameterKey, valueKey, hexColor) =>
    set((state) => {
      const normalized = hexColor.toLowerCase();
      const prevForParam = state.colorByParameterCustomColors[parameterKey] ?? {};
      return {
        colorByParameterCustomColors: {
          ...state.colorByParameterCustomColors,
          [parameterKey]: {
            ...prevForParam,
            [valueKey]: normalized,
          },
        },
      };
    }),

  resetColorByParameterColors: (parameterKey) =>
    set((state) => {
      if (!(parameterKey in state.colorByParameterCustomColors)) return state;
      const next = { ...state.colorByParameterCustomColors };
      delete next[parameterKey];
      return { colorByParameterCustomColors: next };
    }),

  setColorByParameterState: (patch) =>
    set((state) => ({
      ...(patch.availableParams !== undefined
        ? { colorByParameterAvailableParams: patch.availableParams }
        : {}),
      ...(patch.groups !== undefined
        ? { colorByParameterGroups: patch.groups }
        : {}),
      ...(patch.isIndexing !== undefined
        ? { isColorByParameterIndexing: patch.isIndexing }
        : {}),
      ...(patch.availableParams === undefined &&
      patch.groups === undefined &&
      patch.isIndexing === undefined
        ? state
        : {}),
    })),

  addLocalViewpoint: (vp) =>
    set((state) => ({
      localViewpoints: [vp, ...state.localViewpoints],
    })),

  removeLocalViewpoint: (id) =>
    set((state) => ({
      localViewpoints: state.localViewpoints.filter((v) => v.id !== id),
    })),

  setProjects: (projects) => {
    const preferredId = get().currentProjectId;
    const matched = preferredId
      ? projects.find((p) => p.id === preferredId) || null
      : null;

    set({
      projects,
      currentProject: matched,
      currentProjectId: matched?.id ?? null,
    });
  },

  setCurrentProject: (project) => {
    const prevId = get().currentProjectId;
    const nextId = project?.id ?? null;
    const isProjectChanged = prevId !== nextId;
    set((state) => {
      const nextLoadedModels = isProjectChanged
        ? state.loadedModels.map((m) => {
            if (!m.projectId) return m;
            const belongsToNext = m.projectId === nextId;
            return {
              ...m,
              visible: belongsToNext ? (m.userVisible ?? true) : false,
            };
          })
        : state.loadedModels;

      return {
        currentProject: project,
        currentProjectId: nextId,
        activeBcfTopicId: isProjectChanged ? null : state.activeBcfTopicId,
        remoteModels: isProjectChanged ? [] : state.remoteModels,
        loadedModels: nextLoadedModels,
        ...(isProjectChanged
          ? {
              selectedElementId: null,
              selectedModelId: null,
              selectedElementProperties: null,
              selectedElementsMap: {},
              hiddenElementsMap: {},
              customAppearancesMap: {},
              customAppearanceCount: 0,
              isIsolationActive: false,
              isolationRevision: 0,
              colorByParameterKey: null,
              colorByParameterCustomColors: {},
              colorByParameterAvailableParams: [],
              colorByParameterGroups: [],
              isColorByParameterIndexing: false,
              isSectionActive: false,
              isSectionGizmosVisible: true,
              ...(state.activeTool === 'section'
                ? { activeTool: 'select' as const }
                : {}),
            }
          : {}),
      };
    });
  },

  setCurrentProjectById: (projectId) => {
    const match = projectId
      ? get().projects.find((p) => p.id === projectId) || null
      : null;
    get().setCurrentProject(match);
  },

  setRemoteModels: (remoteModels) => set({ remoteModels }),

  setActiveBcfTopicId: (activeBcfTopicId) => set({ activeBcfTopicId }),

  resetProjectContext: () => {
    set((state) => ({
      projects: [],
      currentProjectId: null,
      currentProject: null,
      remoteModels: [],
      activeBcfTopicId: null,
      loadedModels: state.loadedModels.map((m) =>
        m.projectId ? { ...m, visible: false } : m,
      ),
      selectedElementId: null,
      selectedModelId: null,
      selectedElementProperties: null,
      selectedElementsMap: {},
      hiddenElementsMap: {},
      customAppearancesMap: {},
      customAppearanceCount: 0,
      isIsolationActive: false,
      isolationRevision: 0,
      colorByParameterKey: null,
      colorByParameterCustomColors: {},
      colorByParameterAvailableParams: [],
      colorByParameterGroups: [],
      isColorByParameterIndexing: false,
      isSectionActive: false,
      isSectionGizmosVisible: true,
      ...(state.activeTool === 'section' ? { activeTool: 'select' as const } : {}),
    }));
  },
}));
