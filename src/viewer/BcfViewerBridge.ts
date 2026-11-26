import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import type * as OBCF from '@thatopen/components-front';
import type * as FRAGS from '@thatopen/fragments';
import {
  useViewerStore,
  type ElementAppearanceOverride,
} from '../store/useViewerStore';
import type {
  BcfClippingPlane,
  BcfComponentColoring,
  BcfComponents,
  BcfDirection3D,
  BcfPoint3D,
  BcfUnifiedCameraData,
  BcfViewpoint,
  CreateViewpointPayload,
} from '../types/bcf.types';

export const BCF_MAX_SELECTION_LIMIT = 1000;
export const BCF_MAX_SNAPSHOT_DIMENSION = 1500;

export class BcfSelectionLimitError extends Error {
  readonly selectedCount: number;

  constructor(selectedCount: number) {
    super(
      `Hay ${selectedCount} elementos seleccionados. Según la especificación BCF 3.0, reduce la selección a un máximo de ${BCF_MAX_SELECTION_LIMIT} elementos antes de capturar el punto de vista.`,
    );
    this.name = 'BcfSelectionLimitError';
    this.selectedCount = selectedCount;
  }
}

export interface CapturedViewpointDraft {
  payload: CreateViewpointPayload;
  rawSnapshotDataUrl: string;
  snapshotWidth: number;
  snapshotHeight: number;
}

export interface BcfBridgeEngineDeps {
  components: OBC.Components;
  world: OBC.SimpleWorld<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBCF.RendererWith2D
  >;
  fragments: OBC.FragmentsManager;
  clipper: OBC.Clipper | null;
  getModelElementIds: (modelId: string) => Promise<number[]>;
  setCameraProjection: (
    projection: 'Perspective' | 'Orthographic',
  ) => Promise<void>;
  clearSelection: () => Promise<void>;
  focusSelectionMap: (
    selectionByModel: Record<string, number[]>,
    zoomToSelection?: boolean,
  ) => Promise<void>;
  showAllElements: () => Promise<void>;
  applyCustomAppearancesMap: (
    nextMap: Record<string, Record<number, ElementAppearanceOverride>>,
    suppressSelectOverlay?: boolean,
  ) => Promise<void>;
  resetAllCustomAppearances: () => Promise<void>;
  clearSections: () => void;
}

function round6(value: number): number {
  const cleaned = Math.round((value + Number.EPSILON) * 1e6) / 1e6;
  return Object.is(cleaned, -0) ? 0 : cleaned;
}

function resolveReferenceModel(
  fragments: OBC.FragmentsManager,
): FRAGS.FragmentsModel | null {
  if (!fragments.initialized || fragments.list.size === 0) return null;
  if (fragments.baseCoordinationModel) {
    const base = fragments.list.get(fragments.baseCoordinationModel);
    if (base) return base;
  }
  const currentProjectId = useViewerStore.getState().currentProjectId;
  const loadedModels = useViewerStore.getState().loadedModels;
  for (const m of loadedModels) {
    if ((!m.projectId || m.projectId === currentProjectId) && m.visible) {
      const found = fragments.list.get(m.id);
      if (found) return found;
    }
  }
  return fragments.list.values().next().value ?? null;
}

async function resolveIfcTransformMatrices(
  fragments: OBC.FragmentsManager,
): Promise<{
  yupToWorldMatrix: THREE.Matrix4;
  worldToYupMatrix: THREE.Matrix4;
}> {
  const yupToWorldMatrix = new THREE.Matrix4();
  const refModel = resolveReferenceModel(fragments);

  if (refModel) {
    refModel.object.updateMatrixWorld(true);
    const coordMatrix = await refModel
      .getCoordinationMatrix()
      .catch(() => null);
    if (coordMatrix) {
      yupToWorldMatrix.multiplyMatrices(refModel.object.matrixWorld, coordMatrix);
    } else if (fragments.baseCoordinationMatrix) {
      yupToWorldMatrix.multiplyMatrices(
        refModel.object.matrixWorld,
        fragments.baseCoordinationMatrix,
      );
    } else {
      yupToWorldMatrix.copy(refModel.object.matrixWorld);
    }
  } else if (fragments.baseCoordinationMatrix) {
    yupToWorldMatrix.copy(fragments.baseCoordinationMatrix);
  }

  const worldToYupMatrix = yupToWorldMatrix.clone().invert();
  return { yupToWorldMatrix, worldToYupMatrix };
}

/**
 * Converts a Three.js world point (Y-up) into global IFC coordinates (Z-up, meters).
 */
export function worldPointToIfcZUp(
  worldPoint: THREE.Vector3,
  worldToYupMatrix: THREE.Matrix4,
): BcfPoint3D {
  const pYup = worldPoint.clone().applyMatrix4(worldToYupMatrix);
  return {
    x: round6(pYup.x),
    y: round6(-pYup.z),
    z: round6(pYup.y),
  };
}

/**
 * Converts a Three.js unit direction vector (Y-up) into global IFC Z-up coordinates.
 */
export function worldDirectionToIfcZUp(
  worldDir: THREE.Vector3,
  worldToYupMatrix: THREE.Matrix4,
): BcfDirection3D {
  const dYup = worldDir.clone().transformDirection(worldToYupMatrix);
  if (dYup.lengthSq() > 1e-12) {
    dYup.normalize();
  } else {
    dYup.set(0, 0, -1);
  }
  return {
    x: round6(dYup.x),
    y: round6(-dYup.z),
    z: round6(dYup.y),
  };
}

/**
 * Converts a global IFC Z-up point (meters) into Three.js world space (Y-up).
 */
export function ifcZUpPointToWorld(
  ifcPoint: BcfPoint3D,
  yupToWorldMatrix: THREE.Matrix4,
): THREE.Vector3 {
  return new THREE.Vector3(ifcPoint.x, ifcPoint.z, -ifcPoint.y).applyMatrix4(
    yupToWorldMatrix,
  );
}

/**
 * Converts a global IFC Z-up direction vector into Three.js world space (Y-up).
 */
export function ifcZUpDirectionToWorld(
  ifcDir: BcfDirection3D,
  yupToWorldMatrix: THREE.Matrix4,
): THREE.Vector3 {
  const vec = new THREE.Vector3(
    ifcDir.x,
    ifcDir.z,
    -ifcDir.y,
  ).transformDirection(yupToWorldMatrix);
  return vec.lengthSq() > 1e-12 ? vec.normalize() : new THREE.Vector3(0, 0, -1);
}

function recordToModelIdMap(record: Record<string, number[]>): OBC.ModelIdMap {
  const out: OBC.ModelIdMap = {};
  for (const [modelId, ids] of Object.entries(record)) {
    if (ids && ids.length > 0) {
      out[modelId] = new Set(ids);
    }
  }
  return out;
}

function modelIdMapToRecord(map: OBC.ModelIdMap): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [modelId, set] of Object.entries(map)) {
    if (set && set.size > 0) {
      out[modelId] = Array.from(set);
    }
  }
  return out;
}

async function resolveGuidsFromModelIdMap(
  fragments: OBC.FragmentsManager,
  modelIdMap: OBC.ModelIdMap,
): Promise<string[]> {
  if (!fragments.initialized || Object.keys(modelIdMap).length === 0) {
    return [];
  }

  const guidSet = new Set<string>();
  try {
    const rawGuids = await fragments.modelIdMapToGuids(modelIdMap);
    for (const g of rawGuids) {
      if (typeof g === 'string' && g.trim().length > 0) {
        guidSet.add(g.trim());
      }
    }
  } catch {
    // Fallback below
  }

  if (guidSet.size > 0) {
    return Array.from(guidSet);
  }

  // Fallback via getGuidsByLocalIds / getItemsData if needed
  for (const [modelId, idSet] of Object.entries(modelIdMap)) {
    const model = fragments.list.get(modelId);
    if (!model || !idSet || idSet.size === 0) continue;
    const ids = Array.from(idSet);
    try {
      const modelWithGuids = model as FRAGS.FragmentsModel & {
        getGuidsByLocalIds?: (localIds: number[]) => Promise<(string | null)[]>;
      };
      if (typeof modelWithGuids.getGuidsByLocalIds === 'function') {
        const mapped = await modelWithGuids.getGuidsByLocalIds(ids);
        for (const g of mapped) {
          if (typeof g === 'string' && g.trim()) guidSet.add(g.trim());
        }
      }
    } catch {
      // Ignore model guid lookup failure
    }
  }

  return Array.from(guidSet);
}

async function resolveModelIdMapFromGuids(
  fragments: OBC.FragmentsManager,
  guids: string[],
): Promise<OBC.ModelIdMap> {
  const cleanGuids = Array.from(
    new Set(guids.map((g) => g.trim()).filter((g) => g.length > 0)),
  );
  if (!fragments.initialized || cleanGuids.length === 0) {
    return {};
  }
  try {
    return await fragments.guidsToModelIdMap(cleanGuids);
  } catch {
    return {};
  }
}

export function toBcfArgbColor(hexColor: string, opacity = 1): string {
  const clean = hexColor.trim().replace(/^#/, '').toUpperCase();
  const rgb =
    clean.length === 3
      ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
      : clean.slice(-6).padStart(6, '0');
  const clampedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const alphaHex = Math.round(clampedOpacity * 255)
    .toString(16)
    .toUpperCase()
    .padStart(2, '0');
  return `${alphaHex}${rgb}`;
}

export function parseBcfColor(bcfColor: string): {
  color: string;
  opacity?: number;
} | null {
  const clean = bcfColor.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(clean)) {
    return null;
  }
  if (clean.length === 8) {
    const alpha = parseInt(clean.slice(0, 2), 16) / 255;
    const rgb = `#${clean.slice(2).toLowerCase()}`;
    return {
      color: rgb,
      ...(alpha < 0.995 ? { opacity: Math.round(alpha * 100) / 100 } : {}),
    };
  }
  return { color: `#${clean.toLowerCase()}` };
}

function renderScaledSnapshotPng(
  sourceCanvas: HTMLCanvasElement,
  maxDimension = BCF_MAX_SNAPSHOT_DIMENSION,
): { dataUrl: string; width: number; height: number } {
  const srcW = Math.max(1, sourceCanvas.width);
  const srcH = Math.max(1, sourceCanvas.height);
  const longest = Math.max(srcW, srcH);
  const scale = longest > maxDimension ? maxDimension / longest : 1;
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const offscreen = document.createElement('canvas');
  offscreen.width = targetW;
  offscreen.height = targetH;
  const ctx = offscreen.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
  }

  return {
    dataUrl: offscreen.toDataURL('image/png'),
    width: targetW,
    height: targetH,
  };
}

function getVisibleModelsCombinedBox(
  fragments: OBC.FragmentsManager,
): THREE.Box3 | null {
  if (!fragments.initialized) return null;
  const combined = new THREE.Box3();
  let hasAny = false;
  for (const [, model] of fragments.list) {
    if (!model.object.visible) continue;
    const box =
      model.box && !model.box.isEmpty()
        ? model.box
        : new THREE.Box3().setFromObject(model.object);
    if (!box.isEmpty()) {
      combined.union(box);
      hasAny = true;
    }
  }
  return hasAny && !combined.isEmpty() ? combined : null;
}

async function computeModelIdMapCentroid(
  fragments: OBC.FragmentsManager,
  modelIdMap: OBC.ModelIdMap,
): Promise<THREE.Vector3 | null> {
  if (!fragments.initialized || Object.keys(modelIdMap).length === 0) {
    return null;
  }
  try {
    const boxes = await fragments.getBBoxes(modelIdMap);
    if (!boxes || boxes.length === 0) return null;
    const unionBox = new THREE.Box3();
    for (const b of boxes) {
      if (b && !b.isEmpty()) {
        unionBox.union(b);
      }
    }
    if (!unionBox.isEmpty()) {
      return unionBox.getCenter(new THREE.Vector3());
    }
  } catch {
    // Ignore bbox failure
  }
  return null;
}

export async function captureCurrentViewpointDraft(
  deps: BcfBridgeEngineDeps,
): Promise<CapturedViewpointDraft> {
  const { world, fragments, clipper, getModelElementIds } = deps;
  const state = useViewerStore.getState();

  // 1. Validate BCF 3.0 1000-element selection rule
  const totalSelectedCount = Object.values(state.selectedElementsMap).reduce(
    (acc, ids) => acc + ids.length,
    0,
  );
  if (totalSelectedCount > BCF_MAX_SELECTION_LIMIT) {
    throw new BcfSelectionLimitError(totalSelectedCount);
  }

  // 2. Transform camera from Three.js Y-up to global IFC Z-up (meters)
  const { worldToYupMatrix } = await resolveIfcTransformMatrices(fragments);
  const threeCam = world.camera.three;
  threeCam.updateMatrixWorld(true);

  const worldPos = threeCam.position.clone();
  const worldDir = threeCam
    .getWorldDirection(new THREE.Vector3())
    .normalize();
  const worldUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(threeCam.quaternion)
    .normalize();

  const bcfViewPoint = worldPointToIfcZUp(worldPos, worldToYupMatrix);
  const bcfDirection = worldDirectionToIfcZUp(worldDir, worldToYupMatrix);
  const bcfUp = worldDirectionToIfcZUp(worldUp, worldToYupMatrix);

  const domCanvas = world.renderer?.three.domElement;
  const aspectRatio =
    domCanvas && domCanvas.height > 0
      ? round6(domCanvas.width / domCanvas.height)
      : undefined;

  const isOrtho =
    world.camera.projection.current === 'Orthographic' &&
    threeCam instanceof THREE.OrthographicCamera;

  let cameraType: 'perspective' | 'orthogonal';
  let cameraData: BcfUnifiedCameraData;

  if (isOrtho && threeCam instanceof THREE.OrthographicCamera) {
    const viewWorldScale = round6(
      Math.abs(threeCam.top - threeCam.bottom) /
        Math.max(1e-6, threeCam.zoom),
    );
    cameraType = 'orthogonal';
    cameraData = {
      camera_view_point: bcfViewPoint,
      camera_direction: bcfDirection,
      camera_up_vector: bcfUp,
      view_to_world_scale: viewWorldScale,
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    };
  } else {
    const persp = world.camera.threePersp;
    const fov = round6(THREE.MathUtils.clamp(persp.fov || 60, 5, 140));
    cameraType = 'perspective';
    cameraData = {
      camera_view_point: bcfViewPoint,
      camera_direction: bcfDirection,
      camera_up_vector: bcfUp,
      field_of_view: fov,
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    };
  }

  // 3. Serialize Components: selection, optimized visibility, and coloring
  const selectionGuids =
    totalSelectedCount > 0
      ? await resolveGuidsFromModelIdMap(
          fragments,
          recordToModelIdMap(state.selectedElementsMap),
        )
      : [];

  const visibleMap: OBC.ModelIdMap = {};
  const hiddenMap: OBC.ModelIdMap = {};
  let visibleTotal = 0;
  let hiddenTotal = 0;

  const activeProjectId = state.currentProjectId;
  const activeModels = state.loadedModels.filter(
    (m) => !m.projectId || m.projectId === activeProjectId,
  );

  for (const modelInfo of activeModels) {
    const model = fragments.list.get(modelInfo.id);
    if (!model) continue;
    const allIds = await getModelElementIds(modelInfo.id);
    if (allIds.length === 0) continue;

    if (!model.object.visible || !modelInfo.visible) {
      hiddenMap[modelInfo.id] = new Set(allIds);
      hiddenTotal += allIds.length;
      continue;
    }

    const hasElementLevelHidden =
      state.isIsolationActive ||
      (state.hiddenElementsMap[modelInfo.id]?.length ?? 0) > 0;

    if (!hasElementLevelHidden) {
      visibleMap[modelInfo.id] = new Set(allIds);
      visibleTotal += allIds.length;
    } else {
      try {
        const flags = await model.getVisible(allIds);
        const visSet = new Set<number>();
        const hidSet = new Set<number>();
        for (let i = 0; i < allIds.length; i++) {
          if (flags[i] === false) {
            hidSet.add(allIds[i]);
          } else {
            visSet.add(allIds[i]);
          }
        }
        if (visSet.size > 0) {
          visibleMap[modelInfo.id] = visSet;
          visibleTotal += visSet.size;
        }
        if (hidSet.size > 0) {
          hiddenMap[modelInfo.id] = hidSet;
          hiddenTotal += hidSet.size;
        }
      } catch {
        visibleMap[modelInfo.id] = new Set(allIds);
        visibleTotal += allIds.length;
      }
    }
  }

  let defaultVisibility = true;
  let exceptionGuids: string[] = [];

  if (hiddenTotal === 0) {
    defaultVisibility = true;
    exceptionGuids = [];
  } else if (visibleTotal === 0) {
    defaultVisibility = false;
    exceptionGuids = [];
  } else if (hiddenTotal <= visibleTotal) {
    defaultVisibility = true;
    exceptionGuids = await resolveGuidsFromModelIdMap(fragments, hiddenMap);
  } else {
    defaultVisibility = false;
    exceptionGuids = await resolveGuidsFromModelIdMap(fragments, visibleMap);
  }

  // Group custom appearances into BCF 3.0 coloring buckets ("AARRGGBB")
  const colorBuckets = new Map<string, OBC.ModelIdMap>();
  for (const [modelId, overrides] of Object.entries(state.customAppearancesMap)) {
    if (!overrides || !fragments.list.has(modelId)) continue;
    for (const [rawId, ov] of Object.entries(overrides)) {
      if (!ov.color) continue;
      const localId = Number(rawId);
      if (!Number.isFinite(localId)) continue;
      const argb = toBcfArgbColor(ov.color, ov.opacity ?? 1);
      let bucket = colorBuckets.get(argb);
      if (!bucket) {
        bucket = {};
        colorBuckets.set(argb, bucket);
      }
      if (!bucket[modelId]) {
        bucket[modelId] = new Set<number>();
      }
      bucket[modelId].add(localId);
    }
  }

  const coloringEntries: BcfComponentColoring[] = [];
  for (const [argb, bucketMap] of colorBuckets) {
    const guids = await resolveGuidsFromModelIdMap(fragments, bucketMap);
    if (guids.length > 0) {
      coloringEntries.push({
        color: argb,
        components: guids.map((ifc_guid) => ({ ifc_guid })),
      });
    }
  }

  const components: BcfComponents = {
    ...(selectionGuids.length > 0
      ? { selection: selectionGuids.map((ifc_guid) => ({ ifc_guid })) }
      : {}),
    visibility: {
      default_visibility: defaultVisibility,
      ...(exceptionGuids.length > 0
        ? { exceptions: exceptionGuids.map((ifc_guid) => ({ ifc_guid })) }
        : {}),
    },
    ...(coloringEntries.length > 0 ? { coloring: coloringEntries } : {}),
  };

  // 4. Active Clipping Planes (direction pointing towards the cut/hidden side)
  const clippingPlanes: BcfClippingPlane[] = [];
  if (clipper && clipper.enabled && clipper.list.size > 0) {
    for (const [, plane] of clipper.list) {
      if (!plane.enabled) continue;
      const cutDirectionWorld = plane.normal.clone().negate();
      clippingPlanes.push({
        location: worldPointToIfcZUp(plane.origin, worldToYupMatrix),
        direction: worldDirectionToIfcZUp(cutDirectionWorld, worldToYupMatrix),
      });
    }
  }

  // 5. Render WebGL canvas snapshot scaled to max 1500px
  world.renderer?.update();
  const rendered = domCanvas
    ? renderScaledSnapshotPng(domCanvas, BCF_MAX_SNAPSHOT_DIMENSION)
    : { dataUrl: '', width: 0, height: 0 };

  const payload: CreateViewpointPayload = {
    camera_type: cameraType,
    camera_data: cameraData,
    ...(cameraType === 'perspective'
      ? {
          perspective_camera: {
            camera_view_point: cameraData.camera_view_point,
            camera_direction: cameraData.camera_direction,
            camera_up_vector: cameraData.camera_up_vector,
            field_of_view: cameraData.field_of_view ?? 60,
            ...(cameraData.aspect_ratio
              ? { aspect_ratio: cameraData.aspect_ratio }
              : {}),
          },
        }
      : {
          orthogonal_camera: {
            camera_view_point: cameraData.camera_view_point,
            camera_direction: cameraData.camera_direction,
            camera_up_vector: cameraData.camera_up_vector,
            view_to_world_scale: cameraData.view_to_world_scale ?? 20,
            ...(cameraData.aspect_ratio
              ? { aspect_ratio: cameraData.aspect_ratio }
              : {}),
          },
        }),
    components,
    ...(clippingPlanes.length > 0 ? { clipping_planes: clippingPlanes } : {}),
    ...(rendered.dataUrl
      ? {
          snapshot: {
            snapshot_type: 'png',
            snapshot_data: rendered.dataUrl,
          },
        }
      : {}),
  };

  return {
    payload,
    rawSnapshotDataUrl: rendered.dataUrl,
    snapshotWidth: rendered.width,
    snapshotHeight: rendered.height,
  };
}

export async function applyViewpointToEngine(
  deps: BcfBridgeEngineDeps,
  viewpoint: BcfViewpoint,
): Promise<void> {
  const {
    components,
    world,
    fragments,
    clipper,
    setCameraProjection,
    clearSelection,
    focusSelectionMap,
    showAllElements,
    applyCustomAppearancesMap,
    resetAllCustomAppearances,
    clearSections,
  } = deps;

  const { yupToWorldMatrix } = await resolveIfcTransformMatrices(fragments);

  // 1. Visibility: restore default_visibility and apply exceptions
  const vis = viewpoint.components?.visibility;
  if (vis) {
    await showAllElements();
    const hider = components.get(OBC.Hider);
    const defaultVis = vis.default_visibility !== false;
    const exceptionGuids = (vis.exceptions ?? [])
      .map((c) => c.ifc_guid)
      .filter((g): g is string => Boolean(g));

    if (defaultVis) {
      if (exceptionGuids.length > 0) {
        const exceptionMap = await resolveModelIdMapFromGuids(
          fragments,
          exceptionGuids,
        );
        if (Object.keys(exceptionMap).length > 0) {
          await hider.set(false, exceptionMap);
          useViewerStore
            .getState()
            .addHiddenElements(modelIdMapToRecord(exceptionMap));
        }
      }
    } else {
      await hider.set(false);
      if (exceptionGuids.length > 0) {
        const exceptionMap = await resolveModelIdMapFromGuids(
          fragments,
          exceptionGuids,
        );
        if (Object.keys(exceptionMap).length > 0) {
          await hider.set(true, exceptionMap);
        }
      }
      useViewerStore.getState().setIsolationActive(true);
    }
  }

  // 2. Coloring: apply custom component colors (if any) or reset previous ones
  const coloringList = viewpoint.components?.coloring ?? [];
  if (coloringList.length > 0) {
    const nextAppearances: Record<
      string,
      Record<number, ElementAppearanceOverride>
    > = {};

    for (const entry of coloringList) {
      const parsedColor = parseBcfColor(entry.color);
      if (!parsedColor) continue;
      const entryGuids = (entry.components ?? [])
        .map((c) => c.ifc_guid)
        .filter((g): g is string => Boolean(g));
      if (entryGuids.length === 0) continue;

      const mapped = await resolveModelIdMapFromGuids(fragments, entryGuids);
      for (const [modelId, idSet] of Object.entries(mapped)) {
        if (!idSet || idSet.size === 0) continue;
        const modelOverrides = nextAppearances[modelId] ?? {};
        for (const id of idSet) {
          modelOverrides[id] = { ...parsedColor };
        }
        nextAppearances[modelId] = modelOverrides;
      }
    }

    useViewerStore.getState().setColorByParameterKey(null);
    await applyCustomAppearancesMap(nextAppearances, false);
  } else if (useViewerStore.getState().customAppearanceCount > 0) {
    await resetAllCustomAppearances();
  }

  // 3. Selection: clear previous selection & highlight BCF selection components
  await clearSelection();
  const selectionGuids = (viewpoint.components?.selection ?? [])
    .map((c) => c.ifc_guid)
    .filter((g): g is string => Boolean(g));

  let selectionModelMap: OBC.ModelIdMap = {};
  if (selectionGuids.length > 0) {
    selectionModelMap = await resolveModelIdMapFromGuids(
      fragments,
      selectionGuids,
    );
    const selectionRecord = modelIdMapToRecord(selectionModelMap);
    if (Object.keys(selectionRecord).length > 0) {
      await focusSelectionMap(selectionRecord, false);
    }
  }

  // 4. Clipping Planes: destroy current planes & recreate BCF clipping_planes
  clearSections();
  if (
    clipper &&
    viewpoint.clipping_planes &&
    viewpoint.clipping_planes.length > 0
  ) {
    const isGizmosVisible = useViewerStore.getState().isSectionGizmosVisible;
    clipper.enabled = true;
    clipper.visible = isGizmosVisible;

    for (const cp of viewpoint.clipping_planes) {
      const worldOrigin = ifcZUpPointToWorld(cp.location, yupToWorldMatrix);
      const cutDirWorld = ifcZUpDirectionToWorld(
        cp.direction,
        yupToWorldMatrix,
      );
      const planeNormal = cutDirWorld.negate();
      const planeId = clipper.createFromNormalAndCoplanarPoint(
        world,
        planeNormal,
        worldOrigin,
      );
      const plane = clipper.list.get(planeId);
      if (plane) {
        plane.size = clipper.size;
        plane.visible = isGizmosVisible;
        plane.controls.enabled = isGizmosVisible;
        plane.controls.getHelper().visible = isGizmosVisible;
        plane.helper.visible = isGizmosVisible;
      }
    }

    world.renderer?.updateClippingPlanes();
    useViewerStore.getState().setSectionActive(clipper.list.size > 0);
  }

  // 5. Camera: convert BCF Z-up -> Three.js Y-up & smoothly tween camera
  const isOrthoVp =
    viewpoint.camera_type === 'orthogonal' ||
    Boolean(viewpoint.orthogonal_camera);
  const orthoCamData =
    viewpoint.orthogonal_camera ??
    (isOrthoVp ? viewpoint.camera_data : undefined);
  const perspCamData =
    viewpoint.perspective_camera ??
    (!isOrthoVp ? viewpoint.camera_data : undefined);
  const activeCam = orthoCamData ?? perspCamData;

  if (activeCam) {
    const targetProjection = isOrthoVp ? 'Orthographic' : 'Perspective';
    if (world.camera.projection.current !== targetProjection) {
      await setCameraProjection(targetProjection);
    }

    const worldPos = ifcZUpPointToWorld(
      activeCam.camera_view_point,
      yupToWorldMatrix,
    );
    const worldDir = ifcZUpDirectionToWorld(
      activeCam.camera_direction,
      yupToWorldMatrix,
    );

    if (!isOrthoVp && perspCamData?.field_of_view) {
      const fov = THREE.MathUtils.clamp(perspCamData.field_of_view, 5, 140);
      world.camera.threePersp.fov = fov;
      world.camera.threePersp.updateProjectionMatrix();
    }

    // Determine natural orbit target distance along camera_direction
    let targetDist = 12;
    const selCentroid = await computeModelIdMapCentroid(
      fragments,
      selectionModelMap,
    );
    if (selCentroid) {
      const proj = selCentroid.clone().sub(worldPos).dot(worldDir);
      if (proj > 0.25) {
        targetDist = proj;
      }
    } else {
      const bounds = getVisibleModelsCombinedBox(fragments);
      if (bounds) {
        const boundsCenter = bounds.getCenter(new THREE.Vector3());
        const proj = boundsCenter.sub(worldPos).dot(worldDir);
        if (proj > 0.25) {
          targetDist = proj;
        }
      }
    }

    const worldTarget = worldPos
      .clone()
      .addScaledVector(worldDir, targetDist);
    const controls = world.camera.controls;
    void controls.setFocalOffset(0, 0, 0, true);
    await controls.setLookAt(
      worldPos.x,
      worldPos.y,
      worldPos.z,
      worldTarget.x,
      worldTarget.y,
      worldTarget.z,
      true,
    );

    if (
      isOrthoVp &&
      orthoCamData?.view_to_world_scale &&
      orthoCamData.view_to_world_scale > 0
    ) {
      const orthoThree = world.camera.threeOrtho;
      const frustumHeight = Math.abs(orthoThree.top - orthoThree.bottom);
      if (frustumHeight > 1e-6) {
        const nextZoom = THREE.MathUtils.clamp(
          frustumHeight / orthoCamData.view_to_world_scale,
          controls.minZoom,
          controls.maxZoom,
        );
        await controls.zoomTo(nextZoom, true);
      }
    }
  } else if (viewpoint.camera) {
    // Legacy viewer-space camera fallback
    const { position: p, target: t } = viewpoint.camera;
    void world.camera.controls.setFocalOffset(0, 0, 0, true);
    await world.camera.controls.setLookAt(
      p.x,
      p.y,
      p.z,
      t.x,
      t.y,
      t.z,
      true,
    );
  }

  if (fragments.initialized) {
    await fragments.core.update(true);
  }
  world.renderer?.update();
}

export async function resolveViewpointPinWorldPosition(
  fragments: OBC.FragmentsManager,
  viewpoint: BcfViewpoint,
): Promise<THREE.Vector3 | null> {
  if (!fragments.initialized) return null;

  // 1. Prefer centroid of selected elements in the viewpoint
  const selectionGuids = (viewpoint.components?.selection ?? [])
    .map((c) => c.ifc_guid)
    .filter((g): g is string => Boolean(g));

  if (selectionGuids.length > 0) {
    const selMap = await resolveModelIdMapFromGuids(fragments, selectionGuids);
    const centroid = await computeModelIdMapCentroid(fragments, selMap);
    if (centroid) {
      return centroid;
    }
  }

  // 2. Otherwise project ray from camera_view_point along camera_direction
  const activeCam =
    viewpoint.perspective_camera ??
    viewpoint.orthogonal_camera ??
    viewpoint.camera_data;

  if (activeCam) {
    const { yupToWorldMatrix } = await resolveIfcTransformMatrices(fragments);
    const worldPos = ifcZUpPointToWorld(
      activeCam.camera_view_point,
      yupToWorldMatrix,
    );
    const worldDir = ifcZUpDirectionToWorld(
      activeCam.camera_direction,
      yupToWorldMatrix,
    );

    const bounds = getVisibleModelsCombinedBox(fragments);
    if (bounds) {
      const ray = new THREE.Ray(worldPos, worldDir);
      const boxHit = ray.intersectBox(bounds, new THREE.Vector3());
      if (boxHit) {
        const boundsCenter = bounds.getCenter(new THREE.Vector3());
        const centerProj = boundsCenter.sub(worldPos).dot(worldDir);
        const hitDist = worldPos.distanceTo(boxHit);
        const depth =
          centerProj > hitDist ? (hitDist + centerProj) * 0.5 : hitDist;
        return worldPos.clone().addScaledVector(worldDir, Math.max(0.5, depth));
      }
      const center = bounds.getCenter(new THREE.Vector3());
      const proj = center.sub(worldPos).dot(worldDir);
      if (proj > 0.5) {
        return worldPos.clone().addScaledVector(worldDir, proj);
      }
    }

    return worldPos.clone().addScaledVector(worldDir, 8);
  }

  if (viewpoint.camera) {
    return new THREE.Vector3(
      viewpoint.camera.target.x,
      viewpoint.camera.target.y,
      viewpoint.camera.target.z,
    );
  }

  return null;
}
