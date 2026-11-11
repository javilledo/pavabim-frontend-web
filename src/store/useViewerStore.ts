import { create } from 'zustand';
import type { ModelStatusResponse, ProjectWithRole } from '../types/api.types';
import type { CameraViewpointData } from '../types/bcf.types';

export type ActiveTool = 'orbit' | 'select' | 'pan' | 'measure' | 'section';

export interface LoadedModel {
  id: string;
  name: string;
  visible: boolean;
  source?: 'local' | 'remote';
  ifcFileId?: string;
  downloadUrl?: string;
}

export interface LocalViewpoint {
  id: string;
  title: string;
  createdAt: string;
  camera: CameraViewpointData;
  snapshotDataUrl?: string;
}

const ACTIVE_PROJECT_STORAGE_KEY = 'pavabim_active_project_id';

function readSavedProjectId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveProjectId(projectId: string | null): void {
  try {
    if (projectId) {
      window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
    } else {
      window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or sandbox restrictions
  }
}

interface ViewerState {
  // Navigation & Viewer Tools
  activeTool: ActiveTool;
  isGridVisible: boolean;
  isSectionActive: boolean;

  // 3D Loaded Models & Standalone Loading State
  loadedModels: LoadedModel[];
  isLoadingModel: boolean;
  loadingModelName: string | null;
  viewerToastError: string | null;
  selectedElementId: string | null;
  selectedModelId: string | null;
  selectedElementProperties: Record<string, unknown> | null;
  localViewpoints: LocalViewpoint[];

  // Backend Project & BCF Context
  projects: ProjectWithRole[];
  currentProjectId: string | null;
  currentProject: ProjectWithRole | null;
  remoteModels: ModelStatusResponse[];
  activeBcfTopicId: string | null;

  // Actions
  setActiveTool: (tool: ActiveTool) => void;
  toggleGrid: () => void;
  toggleSection: () => void;
  setModelLoading: (loading: boolean, modelName?: string | null) => void;
  setViewerToastError: (error: string | null) => void;
  addLoadedModel: (model: LoadedModel) => void;
  removeLoadedModel: (modelId: string) => void;
  clearLoadedModels: () => void;
  toggleModelVisibility: (modelId: string) => void;
  setSelectedElement: (
    elementId: string | null,
    modelId: string | null,
    properties?: Record<string, unknown> | null,
  ) => void;
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
  isGridVisible: true,
  isSectionActive: false,

  loadedModels: [],
  isLoadingModel: false,
  loadingModelName: null,
  viewerToastError: null,
  selectedElementId: null,
  selectedModelId: null,
  selectedElementProperties: null,
  localViewpoints: [],

  projects: [],
  currentProjectId: readSavedProjectId(),
  currentProject: null,
  remoteModels: [],
  activeBcfTopicId: null,

  setActiveTool: (tool) => set({ activeTool: tool }),

  toggleGrid: () => set((state) => ({ isGridVisible: !state.isGridVisible })),

  toggleSection: () =>
    set((state) => ({ isSectionActive: !state.isSectionActive })),

  setModelLoading: (isLoadingModel, loadingModelName = null) =>
    set({ isLoadingModel, loadingModelName }),

  setViewerToastError: (viewerToastError) => set({ viewerToastError }),

  addLoadedModel: (model) =>
    set((state) => {
      const exists = state.loadedModels.some((m) => m.id === model.id);
      if (exists) {
        return {
          loadedModels: state.loadedModels.map((m) =>
            m.id === model.id ? { ...m, ...model } : m,
          ),
        };
      }
      return { loadedModels: [...state.loadedModels, model] };
    }),

  removeLoadedModel: (modelId) =>
    set((state) => {
      const target = state.loadedModels.find((m) => m.id === modelId);
      if (target?.downloadUrl) {
        URL.revokeObjectURL(target.downloadUrl);
      }
      return {
        loadedModels: state.loadedModels.filter((m) => m.id !== modelId),
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
        selectedElementId: null,
        selectedModelId: null,
        selectedElementProperties: null,
      };
    }),

  toggleModelVisibility: (modelId) =>
    set((state) => ({
      loadedModels: state.loadedModels.map((m) =>
        m.id === modelId ? { ...m, visible: !m.visible } : m,
      ),
    })),

  setSelectedElement: (elementId, modelId, properties = null) =>
    set({
      selectedElementId: elementId,
      selectedModelId: modelId,
      selectedElementProperties: properties,
    }),

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
    const isInitialLoad = get().projects.length === 0;
    const matched = preferredId
      ? projects.find((p) => p.id === preferredId) || null
      : isInitialLoad
        ? projects.find((p) => p.status === 'active') || projects[0] || null
        : null;

    saveProjectId(matched?.id ?? null);
    set({
      projects,
      currentProject: matched,
      currentProjectId: matched?.id ?? null,
    });
  },

  setCurrentProject: (project) => {
    const prevId = get().currentProjectId;
    const nextId = project?.id ?? null;
    saveProjectId(nextId);
    set((state) => ({
      currentProject: project,
      currentProjectId: nextId,
      activeBcfTopicId: prevId !== nextId ? null : state.activeBcfTopicId,
      remoteModels: prevId !== nextId ? [] : state.remoteModels,
    }));
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
    saveProjectId(null);
    set({
      projects: [],
      currentProjectId: null,
      currentProject: null,
      remoteModels: [],
      activeBcfTopicId: null,
    });
  },
}));
