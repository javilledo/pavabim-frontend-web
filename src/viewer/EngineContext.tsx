import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as FRAGS from '@thatopen/fragments';
import '@thatopen/fragments/inline';
import CameraControls from 'camera-controls';
import { useViewerStore } from '../store/useViewerStore';
import type { CameraViewpointData } from '../types/bcf.types';

export interface EngineContextValue {
  isEngineReady: boolean;
  components: OBC.Components | null;
  world: OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer> | null;
  fragments: OBC.FragmentsManager | null;
  highlighter: OBCF.Highlighter | null;
  clipper: OBC.Clipper | null;
  initEngine: (container: HTMLDivElement) => Promise<void>;
  disposeEngine: () => Promise<void>;
  loadModelFromBuffer: (
    buffer: ArrayBuffer | Uint8Array,
    modelId: string,
    modelName: string,
    source?: 'local' | 'remote',
    downloadUrl?: string
  ) => Promise<FRAGS.FragmentsModel>;
  toggleModelVisibility: (modelId: string, visible: boolean) => void;
  removeModel: (modelId: string) => Promise<void>;
  fitCameraToModels: () => Promise<void>;
  focusElement: (modelId: string, localId: number) => Promise<void>;
  clearSelection: () => Promise<void>;
  captureSnapshotBlob: () => Promise<Blob | null>;
  getCameraViewpoint: () => CameraViewpointData | null;
  setCameraViewpoint: (data: CameraViewpointData) => Promise<void>;
  toggleGridVisibility: (visible?: boolean) => void;
  toggleSectionBox: () => void;
  clearMeasurements: () => void;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export const EngineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isEngineReady, setIsEngineReady] = useState(false);

  const initSessionRef = useRef<number>(0);
  const componentsRef = useRef<OBC.Components | null>(null);
  const worldRef = useRef<OBC.SimpleWorld<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBC.SimpleRenderer
  > | null>(null);
  const fragmentsRef = useRef<OBC.FragmentsManager | null>(null);
  const highlighterRef = useRef<OBCF.Highlighter | null>(null);
  const clipperRef = useRef<OBC.Clipper | null>(null);
  const lengthMeasurementRef = useRef<OBCF.LengthMeasurement | null>(null);
  const gridRef = useRef<OBC.SimpleGrid | null>(null);

  const {
    activeTool,
    setSelectedElement,
    setModelLoading,
    addLoadedModel,
    removeLoadedModel,
    clearLoadedModels,
    toggleModelVisibility: toggleStoreModelVisibility,
    toggleGrid: toggleStoreGrid,
    toggleSection: toggleStoreSection,
  } = useViewerStore();

  const initEngine = useCallback(
    async (container: HTMLDivElement) => {
      if (componentsRef.current) return;

      const sessionId = ++initSessionRef.current;

      try {
        // Ensure clean mount target
        container.innerHTML = '';

        // Fetch local inline worker blob URL first
        const workerUrl = await OBC.FragmentsManager.getWorker();
        if (sessionId !== initSessionRef.current) return;

        const components = new OBC.Components();
        componentsRef.current = components;

        const worlds = components.get(OBC.Worlds);
        const world = worlds.create<
          OBC.SimpleScene,
          OBC.OrthoPerspectiveCamera,
          OBC.SimpleRenderer
        >();
        worldRef.current = world;

        // Scene, Renderer & Camera setup
        world.scene = new OBC.SimpleScene(components);
        world.renderer = new OBC.SimpleRenderer(components, container, {
          preserveDrawingBuffer: true,
          antialias: true,
        });
        world.camera = new OBC.OrthoPerspectiveCamera(components);

        components.init();

        world.scene.setup({
          backgroundColor: new THREE.Color(0x0b0b0d), // Pavasal asphalt black
        });

        // Initial camera position
        await world.camera.controls.setLookAt(15, 12, 15, 0, 0, 0);
        if (sessionId !== initSessionRef.current) {
          components.dispose();
          return;
        }

        // Grid setup
        const grids = components.get(OBC.Grids);
        const grid = grids.create(world);
        gridRef.current = grid;

        // Fragments Manager setup
        const fragments = components.get(OBC.FragmentsManager);
        fragmentsRef.current = fragments;
        fragments.init(workerUrl);

        // Trigger LOD / fragments redraw on camera rest
        world.camera.controls.addEventListener('rest', () => {
          if (fragments.initialized) {
            fragments.core.update(true);
          }
        });

        // Highlighter setup
        const highlighter = components.get(OBCF.Highlighter);
        highlighterRef.current = highlighter;
        highlighter.setup({
          world,
          selectName: 'select',
          selectEnabled: true,
          autoHighlightOnClick: true,
          autoUpdateFragments: true,
          selectMaterialDefinition: {
            color: new THREE.Color(0xffc72c), // Pantone / RAL 123 C
            renderedFaces: 0,
            opacity: 0.85,
            transparent: true,
          },
        });

        // Listen for selection changes
        highlighter.events.select.onHighlight.add(async (selection: OBC.ModelIdMap) => {
          const modelIds = Object.keys(selection);
          if (modelIds.length > 0) {
            const modelId = modelIds[0];
            const localIds = selection[modelId];
            const expressId = Array.isArray(localIds)
              ? localIds[0]
              : Array.from(localIds as Set<number>)[0];

            if (expressId !== undefined) {
              const elementStr = String(expressId);
              let props: Record<string, any> | null = null;
              try {
                const itemDataMap = await fragments.getData(selection);
                if (itemDataMap && itemDataMap[modelId] && itemDataMap[modelId].length > 0) {
                  props = itemDataMap[modelId][0] as Record<string, any>;
                }
              } catch (e) {
                console.warn('[EngineContext] Could not fetch element properties:', e);
              }

              setSelectedElement(elementStr, modelId, props);
              return;
            }
          }
          setSelectedElement(null, null, null);
        });

        highlighter.events.select.onClear.add(() => {
          setSelectedElement(null, null, null);
        });

        // Clipper setup
        const clipper = components.get(OBC.Clipper);
        clipper.enabled = false;
        clipperRef.current = clipper;

        // Length Measurement setup
        const lengthMeasurement = components.get(OBCF.LengthMeasurement);
        lengthMeasurement.world = world;
        lengthMeasurement.enabled = false;
        lengthMeasurementRef.current = lengthMeasurement;

        if (sessionId === initSessionRef.current) {
          setIsEngineReady(true);
        }
      } catch (err) {
        console.error('[EngineContext] Failed to initialize ThatOpen 3D Engine:', err);
      }
    },
    [setSelectedElement]
  );

  // Sync active tool with engine components
  useEffect(() => {
    if (!isEngineReady || !worldRef.current) return;

    const controls = worldRef.current.camera.controls;
    const highlighter = highlighterRef.current;
    const lengthMeasurement = lengthMeasurementRef.current;

    if (lengthMeasurement) {
      lengthMeasurement.enabled = activeTool === 'measure';
    }

    if (highlighter) {
      highlighter.config.selectEnabled = activeTool === 'select';
    }

    if (activeTool === 'pan') {
      controls.mouseButtons.left = CameraControls.ACTION.TRUCK;
    } else {
      controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
    }
  }, [activeTool, isEngineReady]);

  const disposeEngine = useCallback(async () => {
    initSessionRef.current++;
    setIsEngineReady(false);
    clearLoadedModels();
    if (componentsRef.current) {
      try {
        componentsRef.current.dispose();
      } catch (err) {
        console.warn('[EngineContext] Error while disposing components:', err);
      }
      componentsRef.current = null;
      worldRef.current = null;
      fragmentsRef.current = null;
      highlighterRef.current = null;
      clipperRef.current = null;
      lengthMeasurementRef.current = null;
      gridRef.current = null;
    }
  }, [clearLoadedModels]);

  const loadModelFromBuffer = useCallback(
    async (
      buffer: ArrayBuffer | Uint8Array,
      modelId: string,
      modelName: string,
      source: 'local' | 'remote' = 'remote',
      downloadUrl?: string
    ): Promise<FRAGS.FragmentsModel> => {
      const fragments = fragmentsRef.current;
      const world = worldRef.current;
      if (!fragments || !world) {
        throw new Error('FragmentsManager or World is not initialized');
      }

      setModelLoading(true, modelName);

      try {
        // Keep a copy only for fallback if a local .frag file was saved uncompressed (raw: true)
        const rawFallbackBuffer =
          buffer.byteLength < 150 * 1024 * 1024
            ? buffer instanceof ArrayBuffer
              ? buffer.slice(0)
              : buffer.slice().buffer
            : null;

        let model: FRAGS.FragmentsModel;
        try {
          model = await fragments.core.load(buffer, {
            modelId,
            camera: world.camera.three,
          });
        } catch (primaryErr) {
          if (!rawFallbackBuffer) throw primaryErr;
          model = await fragments.core.load(rawFallbackBuffer, {
            modelId,
            camera: world.camera.three,
            raw: true,
          });
        }

        world.scene.three.add(model.object);
        await fragments.core.update(true);

        addLoadedModel({
          id: modelId,
          name: modelName,
          visible: true,
          source,
          downloadUrl,
        });

        // Fit camera to loaded model
        try {
          const box =
            model.box && !model.box.isEmpty()
              ? model.box.clone()
              : new THREE.Box3().setFromObject(model.object);

          if (!box.isEmpty()) {
            await world.camera.controls.fitToBox(box, true, {
              paddingLeft: 2,
              paddingRight: 2,
              paddingBottom: 2,
              paddingTop: 2,
            });
            await fragments.core.update(true);
          }
        } catch (err) {
          console.warn('[EngineContext] Camera fit error:', err);
        }

        return model;
      } finally {
        setModelLoading(false, null);
      }
    },
    [addLoadedModel, setModelLoading]
  );

  const toggleModelVisibility = useCallback(
    (modelId: string, visible: boolean) => {
      const fragments = fragmentsRef.current;
      if (!fragments) return;

      const model = fragments.list.get(modelId);
      if (model) {
        model.object.visible = visible;
        toggleStoreModelVisibility(modelId);
      }
    },
    [toggleStoreModelVisibility]
  );

  const removeModel = useCallback(
    async (modelId: string) => {
      const fragments = fragmentsRef.current;
      const world = worldRef.current;
      if (!fragments || !world) return;

      const model = fragments.list.get(modelId);
      if (model) {
        world.scene.three.remove(model.object);
        await fragments.core.disposeModel(modelId);
        removeLoadedModel(modelId);
      }
    },
    [removeLoadedModel]
  );

  const fitCameraToModels = useCallback(async () => {
    const world = worldRef.current;
    const fragments = fragmentsRef.current;
    if (!world) return;

    const combinedBox = new THREE.Box3();
    let hasBox = false;

    if (fragments && fragments.initialized) {
      for (const [, model] of fragments.list) {
        if (model.object.visible) {
          const box =
            model.box && !model.box.isEmpty()
              ? model.box
              : new THREE.Box3().setFromObject(model.object);
          if (!box.isEmpty()) {
            combinedBox.union(box);
            hasBox = true;
          }
        }
      }
    }

    if (hasBox && !combinedBox.isEmpty()) {
      await world.camera.controls.fitToBox(combinedBox, true, {
        paddingLeft: 2,
        paddingRight: 2,
        paddingBottom: 2,
        paddingTop: 2,
      });
    } else {
      await world.camera.controls.setLookAt(15, 12, 15, 0, 0, 0, true);
    }
  }, []);

  const focusElement = useCallback(async (modelId: string, localId: number) => {
    const fragments = fragmentsRef.current;
    const highlighter = highlighterRef.current;
    if (!fragments || !highlighter) return;

    const selection: OBC.ModelIdMap = {
      [modelId]: new Set([localId]),
    };

    await highlighter.highlightByID('select', selection, true, true);
  }, []);

  const clearSelection = useCallback(async () => {
    if (highlighterRef.current) {
      await highlighterRef.current.clear('select');
    }
    setSelectedElement(null, null, null);
  }, [setSelectedElement]);

  const captureSnapshotBlob = useCallback(async (): Promise<Blob | null> => {
    const world = worldRef.current;
    if (!world || !world.renderer) return null;

    world.renderer.update();
    const canvas = world.renderer.three.domElement;

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }, []);

  const getCameraViewpoint = useCallback((): CameraViewpointData | null => {
    const world = worldRef.current;
    if (!world) return null;

    const camera = world.camera.three;
    const target = new THREE.Vector3();
    world.camera.controls.getTarget(target);

    return {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [target.x, target.y, target.z],
      up: [camera.up.x, camera.up.y, camera.up.z],
    };
  }, []);

  const setCameraViewpoint = useCallback(async (data: CameraViewpointData) => {
    const world = worldRef.current;
    if (!world) return;

    const [px, py, pz] = data.position;
    const [tx, ty, tz] = data.target;
    await world.camera.controls.setLookAt(px, py, pz, tx, ty, tz, true);
  }, []);

  const toggleGridVisibility = useCallback(
    (visible?: boolean) => {
      if (gridRef.current) {
        const targetState = visible !== undefined ? visible : !gridRef.current.three.visible;
        gridRef.current.three.visible = targetState;
        toggleStoreGrid();
      }
    },
    [toggleStoreGrid]
  );

  const toggleSectionBox = useCallback(() => {
    const clipper = clipperRef.current;
    const world = worldRef.current;
    if (!clipper || !world) return;

    if (clipper.enabled) {
      clipper.deleteAll();
      clipper.enabled = false;
    } else {
      clipper.enabled = true;
      clipper.create(world);
    }
    toggleStoreSection();
  }, [toggleStoreSection]);

  const clearMeasurements = useCallback(() => {
    if (lengthMeasurementRef.current) {
      lengthMeasurementRef.current.list.clear();
    }
  }, []);

  return (
    <EngineContext.Provider
      value={{
        isEngineReady,
        components: componentsRef.current,
        world: worldRef.current,
        fragments: fragmentsRef.current,
        highlighter: highlighterRef.current,
        clipper: clipperRef.current,
        initEngine,
        disposeEngine,
        loadModelFromBuffer,
        toggleModelVisibility,
        removeModel,
        fitCameraToModels,
        focusElement,
        clearSelection,
        captureSnapshotBlob,
        getCameraViewpoint,
        setCameraViewpoint,
        toggleGridVisibility,
        toggleSectionBox,
        clearMeasurements,
      }}
    >
      {children}
    </EngineContext.Provider>
  );
};

export const useEngine = (): EngineContextValue => {
  const context = useContext(EngineContext);
  if (!context) {
    throw new Error('useEngine must be used within an EngineProvider');
  }
  return context;
};

export default EngineContext;
