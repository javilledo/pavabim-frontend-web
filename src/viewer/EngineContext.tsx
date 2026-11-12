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
import { useViewerStore, type CameraProjectionMode } from '../store/useViewerStore';
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
  setPlanView: () => Promise<void>;
  focusElement: (modelId: string, localId: number) => Promise<void>;
  clearSelection: () => Promise<void>;
  captureSnapshotBlob: () => Promise<Blob | null>;
  getCameraViewpoint: () => CameraViewpointData | null;
  setCameraViewpoint: (data: CameraViewpointData) => Promise<void>;
  toggleGridVisibility: (visible?: boolean) => void;
  toggleSectionBox: () => void;
  clearMeasurements: () => void;
  setCameraProjection: (projection: CameraProjectionMode) => Promise<void>;
}

const EngineContext = createContext<EngineContextValue | null>(null);

type SyncFastModelPicker = {
  pick?: (
    position: THREE.Vector2,
    request: { depth?: boolean; id?: boolean; normal?: boolean }
  ) => { surface: { point: THREE.Vector3; distance: number } | null } | null;
};

function getVisibleModelsBounds(fragments: OBC.FragmentsManager | null): THREE.Box3 | null {
  if (!fragments || !fragments.initialized) return null;
  const combinedBox = new THREE.Box3();
  let hasBox = false;

  for (const [, model] of fragments.list) {
    if (!model.object.visible) continue;
    const box =
      model.box && !model.box.isEmpty()
        ? model.box
        : new THREE.Box3().setFromObject(model.object);
    if (!box.isEmpty()) {
      combinedBox.union(box);
      hasBox = true;
    }
  }

  return hasBox && !combinedBox.isEmpty() ? combinedBox : null;
}

function applyOrbitAnchor(controls: CameraControls, point: THREE.Vector3): void {
  // Stop easing transitions so camera.position and matrixWorldInverse match before pivoting.
  controls.stop();
  controls.update(0);

  const prevMin = controls.minDistance;
  const prevMax = controls.maxDistance;
  const distance = point.distanceTo(controls.camera.position);

  controls.minDistance = 0.001;
  controls.maxDistance = Math.max(prevMax, distance + 1);
  controls.setOrbitPoint(point.x, point.y, point.z);
  controls.minDistance = prevMin;
  controls.maxDistance = prevMax;
  controls.update(0);
}

function resolveSyncSurfacePoint(
  components: OBC.Components,
  world: OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>,
  ndc: THREE.Vector2
): THREE.Vector3 | null {
  const camPos = world.camera.three.position;
  let bestPoint: THREE.Vector3 | null = null;
  let bestDistSq = Infinity;

  if (world.renderer?.api !== 'webgpu') {
    const picker = components.get(OBC.FastModelPickers).get(world) as unknown as SyncFastModelPicker;
    if (typeof picker.pick === 'function') {
      const hit = picker.pick(ndc, { depth: true });
      if (hit?.surface?.point) {
        const surfacePoint = hit.surface.point.clone();
        bestPoint = surfacePoint;
        bestDistSq = camPos.distanceToSquared(surfacePoint);
      }
    }
  }

  if (world.meshes.size > 0) {
    const raycaster = components.get(OBC.Raycasters).get(world);
    const meshHit = raycaster.castRayToObjects(Array.from(world.meshes), ndc);
    if (meshHit?.point) {
      const distSq = camPos.distanceToSquared(meshHit.point);
      if (distSq < bestDistSq) {
        bestPoint = meshHit.point.clone();
      }
    }
  }

  return bestPoint;
}

async function resolveAsyncSurfacePoint(
  components: OBC.Components,
  world: OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>,
  fragments: OBC.FragmentsManager,
  ndc: THREE.Vector2,
  clientPos: THREE.Vector2,
  domElement: HTMLCanvasElement
): Promise<THREE.Vector3 | null> {
  const picker = components.get(OBC.FastModelPickers).get(world);
  const modelRaycasts = fragments.initialized
    ? Array.from(fragments.list.values()).map((model) =>
        model
          .raycast({
            camera: world.camera.three,
            mouse: clientPos,
            dom: domElement,
          })
          .catch(() => null)
      )
    : [];

  const [pickerPoint, ...modelHits] = await Promise.all([
    picker.getPointAt(ndc).catch(() => null),
    ...modelRaycasts,
  ]);

  const camPos = world.camera.three.position;
  let bestPoint: THREE.Vector3 | null = pickerPoint ? pickerPoint.clone() : null;
  let bestDistSq = bestPoint ? camPos.distanceToSquared(bestPoint) : Infinity;

  for (const hit of modelHits) {
    if (!hit?.point) continue;
    const distSq = camPos.distanceToSquared(hit.point);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestPoint = hit.point.clone();
    }
  }

  return bestPoint;
}

export const EngineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isEngineReady, setIsEngineReady] = useState(false);

  const initSessionRef = useRef<number>(0);
  const anchorRequestIdRef = useRef<number>(0);
  const pointerOrbitCleanupRef = useRef<(() => void) | null>(null);
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
    setCameraProjection: setStoreCameraProjection,
  } = useViewerStore();

  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

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

        // Allow close inspection on elements and large civil models without 300m distance clamp
        world.camera.controls.minDistance = 0.05;
        world.camera.controls.maxDistance = Infinity;
        world.dynamicAnchor = false;

        // Reduce default near clipping plane (1m -> adaptive 0.01m..0.1m) to avoid slicing close elements
        world.camera.threePersp.near = 0.05;
        world.camera.threePersp.far = 2500;
        world.camera.threePersp.updateProjectionMatrix();

        world.camera.threeOrtho.near = 0.05;
        world.camera.threeOrtho.far = 2500;
        world.camera.threeOrtho.updateProjectionMatrix();
        world.camera.projection.matchOrthoDistanceEnabled = true;

        const syncCameraNearPlane = () => {
          if (world.camera.projection.current !== 'Perspective') return;
          const persp = world.camera.threePersp;
          const dist = Math.max(0.05, world.camera.controls.distance);
          const minNear = Math.max(0.01, persp.far / 250000);
          const desiredNear = THREE.MathUtils.clamp(dist * 0.015, minNear, 0.1);
          if (Math.abs(persp.near - desiredNear) > desiredNear * 0.1) {
            persp.near = desiredNear;
            persp.updateProjectionMatrix();
          }
        };
        world.camera.controls.addEventListener('update', syncCameraNearPlane);

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

        // Sync loaded models' frustum culling/LOD camera and store state when switching projections
        world.camera.projection.onChanged.add(
          (camera: THREE.PerspectiveCamera | THREE.OrthographicCamera) => {
          syncCameraNearPlane();
          setStoreCameraProjection(world.camera.projection.current);
          if (fragments.initialized) {
            for (const [, model] of fragments.list) {
              model.useCamera(camera);
            }
            void fragments.core.update(true);
          }
        });
        setStoreCameraProjection(world.camera.projection.current);

        // Trigger LOD / fragments redraw on camera rest
        world.camera.controls.addEventListener('rest', () => {
          if (fragments.initialized) {
            fragments.core.update(true);
          }
        });

        // Capture-phase left-button orbit anchoring BEFORE camera-controls starts dragging
        const domElement = world.renderer.three.domElement;
        const handleOrbitAnchorPointerDown = (event: PointerEvent) => {
          if (event.button !== 0 || activeToolRef.current === 'pan') return;
          const currentWorld = worldRef.current;
          if (!currentWorld?.camera.hasCameraControls()) return;
          const controls = currentWorld.camera.controls;
          if (!controls.enabled) return;

          const bounds = domElement.getBoundingClientRect();
          if (bounds.width <= 0 || bounds.height <= 0) return;

          const ndc = new THREE.Vector2(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            -((event.clientY - bounds.top) / bounds.height) * 2 + 1
          );

          const requestId = ++anchorRequestIdRef.current;
          const syncPoint = resolveSyncSurfacePoint(components, currentWorld, ndc);
          if (syncPoint) {
            applyOrbitAnchor(controls, syncPoint);
            return;
          }

          const clientPos = new THREE.Vector2(event.clientX, event.clientY);
          void resolveAsyncSurfacePoint(
            components,
            currentWorld,
            fragments,
            ndc,
            clientPos,
            domElement
          ).then((asyncPoint) => {
            if (
              !asyncPoint ||
              requestId !== anchorRequestIdRef.current ||
              sessionId !== initSessionRef.current ||
              currentWorld.isDisposing ||
              activeToolRef.current === 'pan' ||
              !currentWorld.camera.hasCameraControls()
            ) {
              return;
            }
            applyOrbitAnchor(currentWorld.camera.controls, asyncPoint);
          });
        };

        pointerOrbitCleanupRef.current?.();
        domElement.addEventListener('pointerdown', handleOrbitAnchorPointerDown, {
          capture: true,
        });
        pointerOrbitCleanupRef.current = () => {
          domElement.removeEventListener('pointerdown', handleOrbitAnchorPointerDown, {
            capture: true,
          });
        };

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
    [setSelectedElement, setStoreCameraProjection]
  );

  // Sync active tool with engine components
  useEffect(() => {
    if (!isEngineReady || !worldRef.current) return;

    const world = worldRef.current;
    const controls = world.camera.controls;
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
    anchorRequestIdRef.current++;
    pointerOrbitCleanupRef.current?.();
    pointerOrbitCleanupRef.current = null;
    setIsEngineReady(false);
    setStoreCameraProjection('Perspective');
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
  }, [clearLoadedModels, setStoreCameraProjection]);

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
            const size = box.getSize(new THREE.Vector3());
            const maxExtent = Math.max(size.x, size.y, size.z);
            if (Number.isFinite(maxExtent) && maxExtent > 0) {
              const dynamicFar = Math.max(2500, maxExtent * 10);
              world.camera.threePersp.far = dynamicFar;
              world.camera.threePersp.updateProjectionMatrix();
              world.camera.threeOrtho.far = dynamicFar;
              world.camera.threeOrtho.updateProjectionMatrix();
            }

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
    if (!world) return;

    const combinedBox = getVisibleModelsBounds(fragmentsRef.current);
    if (combinedBox) {
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

  const setPlanView = useCallback(async () => {
    const world = worldRef.current;
    const fragments = fragmentsRef.current;
    if (!world) return;

    const controls = world.camera.controls;
    const combinedBox = getVisibleModelsBounds(fragments);

    if (combinedBox) {
      const size = combinedBox.getSize(new THREE.Vector3());
      const center = combinedBox.getCenter(new THREE.Vector3());
      // Keep orthographic camera above the highest roof geometry so near clipping never slices it
      if (world.camera.projection.current === 'Orthographic') {
        const minTopClearance = combinedBox.max.y - center.y + Math.max(10, size.y * 0.5);
        if (controls.distance < minTopClearance) {
          void controls.dollyTo(minTopClearance, false);
        }
      }
      // Orient straight overhead (+X right, -Z up) before fitToBox samples _sphericalEnd
      void controls.rotateTo(0, 0, true);
      await controls.fitToBox(combinedBox, true, {
        paddingLeft: 2,
        paddingRight: 2,
        paddingBottom: 2,
        paddingTop: 2,
      });
    } else {
      await controls.setLookAt(0, 20, 0.001, 0, 0, 0, true);
    }

    if (fragments?.initialized) {
      await fragments.core.update(true);
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

  const setCameraProjection = useCallback(
    async (projection: CameraProjectionMode) => {
      const world = worldRef.current;
      if (!world) return;
      if (world.camera.projection.current === projection) {
        setStoreCameraProjection(projection);
        return;
      }
      await world.camera.projection.set(projection);
      setStoreCameraProjection(world.camera.projection.current);
    },
    [setStoreCameraProjection]
  );

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
        setPlanView,
        focusElement,
        clearSelection,
        captureSnapshotBlob,
        getCameraViewpoint,
        setCameraViewpoint,
        toggleGridVisibility,
        toggleSectionBox,
        clearMeasurements,
        setCameraProjection,
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
