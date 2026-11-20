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
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as FRAGS from '@thatopen/fragments';
import '@thatopen/fragments/inline';
import CameraControls from 'camera-controls';
import { useViewerStore, type CameraProjectionMode } from '../store/useViewerStore';
import type { CameraViewpointData } from '../types/bcf.types';
import { formatDecimalEs } from '../utils/numberFormat';
import { computeMeshMetrics } from '../utils/selectionMeasurements';
import {
  collectCoplanarFragmentFaceArea,
  collectCoplanarMeshRegion,
  computePlanarFaceAreaAndLabelPoint,
  triangulatePlanarFace,
  type AreaFaceMeasurement,
  type ComputedMeasurement,
  type MeasureSnapTarget,
  type VolumeElementMeasurement,
} from '../utils/measureGeometry';

export type {
  AreaFaceMeasurement,
  ComputedMeasurement,
  MeasureSnapTarget,
  VolumeElementMeasurement,
} from '../utils/measureGeometry';

export interface SurfaceFaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface GeoreferencedCoordinates {
  x: number;
  y: number;
  z: number;
  crsName?: string | null;
}

export interface PickedCoordinateResult {
  /** Hit position in Three.js viewer world coordinates (used for screen marker projection). */
  point: THREE.Vector3;
  /** True georeferenced civil/BIM coordinates (Easting X, Northing Y, Elevation Z in meters). */
  georeferencedPoint: GeoreferencedCoordinates;
  snappedToVertex: boolean;
}

export interface LoadModelOptions {
  fragModifiedTime?: string;
  projectId?: string;
  skipCameraFit?: boolean;
  initialVisible?: boolean;
}

export interface EngineContextValue {
  isEngineReady: boolean;
  components: OBC.Components | null;
  world: OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.RendererWith2D> | null;
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
    downloadUrl?: string,
    options?: LoadModelOptions
  ) => Promise<FRAGS.FragmentsModel>;
  toggleModelVisibility: (modelId: string, visible: boolean) => void;
  removeModel: (modelId: string) => Promise<void>;
  fitCameraToModels: () => Promise<void>;
  setPlanView: () => Promise<void>;
  focusElement: (modelId: string, localId: number) => Promise<void>;
  focusElements: (modelId: string, localIds: number[], zoomToSelection?: boolean) => Promise<void>;
  focusSelectionMap: (selectionByModel: Record<string, number[]>, zoomToSelection?: boolean) => Promise<void>;
  toggleSelectionMap: (selectionByModel: Record<string, number[]>, zoomToSelection?: boolean) => Promise<void>;
  clearSelection: () => Promise<void>;
  hideSelectedElements: (keepSelection?: boolean) => Promise<void>;
  toggleHideSelectedElements: () => Promise<void>;
  isolateSelectedElements: () => Promise<void>;
  showAllElements: () => Promise<void>;
  captureSnapshotBlob: () => Promise<Blob | null>;
  getCameraViewpoint: () => CameraViewpointData | null;
  setCameraViewpoint: (data: CameraViewpointData) => Promise<void>;
  toggleGridVisibility: (visible?: boolean) => void;
  toggleSectionBox: () => void;
  pickFaceAtClientPoint: (clientX: number, clientY: number) => Promise<SurfaceFaceHit | null>;
  pickCoordinateAtClientPoint: (
    clientX: number,
    clientY: number
  ) => Promise<PickedCoordinateResult | null>;
  createSectionFromFace: (point: THREE.Vector3, normal: THREE.Vector3) => void;
  lookPerpendicularToFace: (point: THREE.Vector3, normal: THREE.Vector3) => Promise<void>;
  toggleSectionGizmosVisibility: (visible?: boolean) => void;
  pickSectionPlaneAtClientPoint: (clientX: number, clientY: number) => string | null;
  deleteSectionPlane: (planeId: string) => void;
  clearSections: () => void;
  measurementCount: number;
  pickMeasureTargetAtClientPoint: (
    clientX: number,
    clientY: number
  ) => Promise<MeasureSnapTarget | null>;
  updateMeasureOverlay: (
    state: {
      hover?: MeasureSnapTarget | null;
      anchor?: MeasureSnapTarget | null;
      preview?: ComputedMeasurement | null;
    } | null
  ) => void;
  commitMeasurement: (measurement: ComputedMeasurement) => void;
  removeLastMeasurement: () => void;
  clearMeasurements: () => void;
  pickAreaFaceAtClientPoint: (
    clientX: number,
    clientY: number
  ) => Promise<AreaFaceMeasurement | null>;
  updateAreaSelectedOverlay: (items: AreaFaceMeasurement[]) => void;
  updateAreaHoverOverlay: (hover: AreaFaceMeasurement | null) => void;
  updateAreaMeasureOverlay: (
    items: AreaFaceMeasurement[],
    hover?: AreaFaceMeasurement | null
  ) => void;
  pickVolumeElementAtClientPoint: (
    clientX: number,
    clientY: number,
    options?: { hoverOnly?: boolean }
  ) => Promise<VolumeElementMeasurement | null>;
  updateVolumeSelectedOverlay: (items: VolumeElementMeasurement[]) => Promise<void>;
  updateVolumeHoverOverlay: (hover: VolumeElementMeasurement | null) => Promise<void>;
  updateVolumeMeasureOverlay: (
    items: VolumeElementMeasurement[],
    hover?: VolumeElementMeasurement | null
  ) => Promise<void>;
  setCameraProjection: (projection: CameraProjectionMode) => Promise<void>;
}

const EngineContext = createContext<EngineContextValue | null>(null);

type SyncFastModelPicker = {
  pick?: (
    position: THREE.Vector2,
    request: { depth?: boolean; id?: boolean; normal?: boolean }
  ) => {
    surface: { point: THREE.Vector3; distance: number } | null;
    normal?: THREE.Vector3 | null;
  } | null;
};

function orientOutwardNormal(
  normal: THREE.Vector3,
  point: THREE.Vector3,
  camera: THREE.Camera
): THREE.Vector3 {
  const resolved = normal.clone();
  const toCamera =
    camera instanceof THREE.OrthographicCamera
      ? new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion)
      : camera.position.clone().sub(point);

  if (resolved.lengthSq() <= 1e-8) {
    return toCamera.lengthSq() > 1e-8
      ? toCamera.normalize()
      : new THREE.Vector3(0, 1, 0);
  }

  resolved.normalize();
  if (toCamera.lengthSq() > 1e-8 && resolved.dot(toCamera) < 0) {
    resolved.negate();
  }
  return resolved;
}

function getMeshWorldNormal(
  object: THREE.Object3D,
  faceNormal: THREE.Vector3,
  instanceId?: number
): THREE.Vector3 {
  const transform = object.matrixWorld.clone();
  if (object instanceof THREE.InstancedMesh && instanceId !== undefined) {
    const instanceMatrix = new THREE.Matrix4();
    object.getMatrixAt(instanceId, instanceMatrix);
    transform.multiply(instanceMatrix);
  }
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
  return faceNormal.clone().applyMatrix3(normalMatrix).normalize();
}

interface MeasureBadgeEntry {
  key: string;
  labelObj: CSS2DObject;
  primaryDiv: HTMLDivElement;
  subDiv: HTMLDivElement;
  containerDiv: HTMLDivElement;
}

function createMeasureBadgeEntry(
  key: string,
  primaryText: string,
  borderColor: string,
  secondaryText?: string
): MeasureBadgeEntry {
  const containerDiv = document.createElement('div');
  containerDiv.className = 'pavabim-measure-badge';
  containerDiv.style.background = 'rgba(15, 23, 42, 0.94)';
  containerDiv.style.border = `1px solid ${borderColor}`;
  containerDiv.style.color = '#f8fafc';
  containerDiv.style.fontSize = '12px';
  containerDiv.style.fontWeight = '600';
  containerDiv.style.fontVariantNumeric = 'tabular-nums';
  containerDiv.style.padding = '3px 8px';
  containerDiv.style.borderRadius = '6px';
  containerDiv.style.whiteSpace = 'nowrap';
  containerDiv.style.lineHeight = '1.25';
  containerDiv.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5)';
  containerDiv.style.pointerEvents = 'none';
  containerDiv.style.userSelect = 'none';
  containerDiv.style.zIndex = '5';
  containerDiv.style.contain = 'layout style';

  const primaryDiv = document.createElement('div');
  primaryDiv.textContent = primaryText;
  containerDiv.appendChild(primaryDiv);

  const subDiv = document.createElement('div');
  subDiv.style.fontSize = '10px';
  subDiv.style.fontWeight = '500';
  subDiv.style.color = '#cbd5e1';
  if (secondaryText) {
    subDiv.textContent = secondaryText;
    subDiv.style.display = 'block';
  } else {
    subDiv.style.display = 'none';
  }
  containerDiv.appendChild(subDiv);

  const labelObj = new CSS2DObject(containerDiv);
  return { key, labelObj, primaryDiv, subDiv, containerDiv };
}

function syncMeasureBadgeEntry(
  entry: MeasureBadgeEntry,
  primaryText: string,
  borderColor: string,
  secondaryText?: string
): void {
  if (entry.primaryDiv.textContent !== primaryText) {
    entry.primaryDiv.textContent = primaryText;
  }
  if (secondaryText) {
    if (entry.subDiv.textContent !== secondaryText) {
      entry.subDiv.textContent = secondaryText;
    }
    if (entry.subDiv.style.display !== 'block') {
      entry.subDiv.style.display = 'block';
    }
  } else {
    if (entry.subDiv.style.display !== 'none') {
      entry.subDiv.style.display = 'none';
    }
  }
  if (entry.containerDiv.style.borderColor !== borderColor) {
    entry.containerDiv.style.borderColor = borderColor;
  }
}

function clearDynamicMeasureGroup(
  group: THREE.Group,
  disposables?: { dispose: () => void }[]
): void {
  if (disposables) {
    for (const item of disposables) {
      item.dispose();
    }
    disposables.length = 0;
  }

  group.clear();
}

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

function setModelHierarchyVisibility(
  model: FRAGS.FragmentsModel,
  visible: boolean
): void {
  model.object.visible = visible;
  model.object.traverse((child) => {
    child.visible = visible;
  });
}

const VARIOS_FLAG = '__pavabimVarios';

interface VariosAttributeMarker {
  value: '<varios>';
  [VARIOS_FLAG]: true;
}

function createVariosMarker(): VariosAttributeMarker {
  return {
    value: '<varios>',
    [VARIOS_FLAG]: true,
  };
}

function formatComparableAttributeValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
    const inner = (val as Record<string, unknown>).value;
    return inner !== null && inner !== undefined ? String(inner) : '—';
  }
  return String(val);
}

function mergeMultipleElementProperties(
  records: Record<string, unknown>[],
  totalCount = records.length
): Record<string, unknown> {
  const orderedKeys: string[] = [];
  const seenKeys = new Set<string>();

  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        orderedKeys.push(key);
      }
    }
  }

  const merged: Record<string, unknown> = {};

  for (const key of orderedKeys) {
    const isArrayInAny = records.some((rec) => Array.isArray(rec[key]));

    if (!isArrayInAny) {
      if (records.length < totalCount) {
        merged[key] = createVariosMarker();
        continue;
      }

      let allHaveKey = true;
      let firstFormatted: string | null = null;
      let allMatch = true;

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        if (!Object.prototype.hasOwnProperty.call(rec, key)) {
          allHaveKey = false;
          allMatch = false;
          break;
        }
        const formatted = formatComparableAttributeValue(rec[key]);
        if (i === 0) {
          firstFormatted = formatted;
        } else if (formatted !== firstFormatted) {
          allMatch = false;
          break;
        }
      }

      if (allHaveKey && allMatch) {
        merged[key] = records[0][key];
      } else {
        merged[key] = createVariosMarker();
      }
    } else {
      const subItemOrder: string[] = [];
      const subItemsByGroupName = new Map<string, Record<string, unknown>[]>();

      for (const rec of records) {
        const arr = rec[key];
        if (!Array.isArray(arr)) continue;

        const seenInThisRec = new Map<string, number>();
        for (let idx = 0; idx < arr.length; idx++) {
          const entry = arr[idx];
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
          const entryObj = entry as Record<string, unknown>;
          const baseName = entryObj.Name
            ? formatComparableAttributeValue(entryObj.Name)
            : `Item ${idx + 1}`;
          const occurrence = (seenInThisRec.get(baseName) ?? 0) + 1;
          seenInThisRec.set(baseName, occurrence);
          const subKey = occurrence === 1 ? baseName : `${baseName}#${occurrence}`;

          if (!subItemsByGroupName.has(subKey)) {
            subItemOrder.push(subKey);
            subItemsByGroupName.set(subKey, []);
          }
          subItemsByGroupName.get(subKey)!.push(entryObj);
        }
      }

      const mergedSubItems: Record<string, unknown>[] = [];
      for (const subKey of subItemOrder) {
        const groupEntries = subItemsByGroupName.get(subKey) ?? [];
        if (groupEntries.length === 0) continue;
        const mergedSub = mergeMultipleElementProperties(groupEntries, totalCount);
        if (groupEntries[0].Name !== undefined) {
          mergedSub.Name = groupEntries[0].Name;
        }
        mergedSubItems.push(mergedSub);
      }

      merged[key] = mergedSubItems;
    }
  }

  return merged;
}

function computeWorldFocalOffset(
  centerPos: THREE.Vector3,
  targetPos: THREE.Vector3,
  focalOffset: THREE.Vector3,
  cameraUp: THREE.Vector3
): THREE.Vector3 {
  if (focalOffset.lengthSq() <= 1e-12) {
    return new THREE.Vector3();
  }
  const basis = new THREE.Matrix4().lookAt(centerPos, targetPos, cameraUp);
  const right = new THREE.Vector3().setFromMatrixColumn(basis, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(basis, 1);
  const back = new THREE.Vector3().setFromMatrixColumn(basis, 2);
  return new THREE.Vector3()
    .addScaledVector(right, focalOffset.x)
    .addScaledVector(up, -focalOffset.y)
    .addScaledVector(back, focalOffset.z);
}

function freezeControlsAtCurrentPose(controls: CameraControls): void {
  const currSpherical = controls.getSpherical(new THREE.Spherical(), false);
  const currTarget = controls.getTarget(new THREE.Vector3(), false);
  const currFocal = controls.getFocalOffset(new THREE.Vector3(), false);
  const currZoom = controls.camera.zoom;

  controls.rotateTo(currSpherical.theta, currSpherical.phi, false);
  controls.dollyTo(Math.max(0.001, currSpherical.radius), false);
  controls.moveTo(currTarget.x, currTarget.y, currTarget.z, false);
  controls.setFocalOffset(currFocal.x, currFocal.y, currFocal.z, false);
  controls.zoomTo(currZoom, false);
  controls.update(0);
}

function recenterFocalOffsetPreservingView(
  controls: CameraControls,
  camera: THREE.Camera
): void {
  const currFocal = controls.getFocalOffset(new THREE.Vector3(), false);
  const endFocal = controls.getFocalOffset(new THREE.Vector3(), true);
  if (currFocal.lengthSq() <= 1e-12 && endFocal.lengthSq() <= 1e-12) {
    return;
  }

  const currCenter = controls.getPosition(new THREE.Vector3(), false);
  const currTarget = controls.getTarget(new THREE.Vector3(), false);
  const currCenteredTarget = currTarget
    .clone()
    .add(computeWorldFocalOffset(currCenter, currTarget, currFocal, camera.up));

  const endCenter = controls.getPosition(new THREE.Vector3(), true);
  const endTarget = controls.getTarget(new THREE.Vector3(), true);
  const endCenteredTarget = endTarget
    .clone()
    .add(computeWorldFocalOffset(endCenter, endTarget, endFocal, camera.up));

  controls.setFocalOffset(0, 0, 0, false);
  void controls.moveTo(
    currCenteredTarget.x,
    currCenteredTarget.y,
    currCenteredTarget.z,
    false
  );
  if (currCenteredTarget.distanceToSquared(endCenteredTarget) > 1e-10) {
    void controls.moveTo(
      endCenteredTarget.x,
      endCenteredTarget.y,
      endCenteredTarget.z,
      true
    );
  } else {
    controls.update(0);
  }
}

function applyOrbitAnchor(controls: CameraControls, point: THREE.Vector3): void {
  const prevMin = controls.minDistance;
  const prevMax = controls.maxDistance;
  controls.minDistance = 0.001;

  // Freeze at the exact current visual pose so cursor and camera.matrixWorldInverse match before pivoting.
  freezeControlsAtCurrentPose(controls);

  const distance = point.distanceTo(controls.camera.position);
  controls.maxDistance = Math.max(prevMax, distance + 1);
  controls.setOrbitPoint(point.x, point.y, point.z);
  controls.minDistance = prevMin;
  controls.maxDistance = prevMax;
  controls.update(0);
}

const ORBIT_MARKER_PIXEL_SIZE = 14;

function createOrbitCenterMarker(): { sprite: THREE.Sprite; dispose: () => void } {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const center = size * 0.5;
    const radius = 23;

    // Soft outer shadow halo for contrast against light surfaces
    const halo = ctx.createRadialGradient(center, center, radius * 0.75, center, center, 31);
    halo.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
    halo.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(center, center, 31, 0, Math.PI * 2);
    ctx.fill();

    // 3D yellow spherical shading
    const sphereGrad = ctx.createRadialGradient(
      center - radius * 0.34,
      center - radius * 0.36,
      radius * 0.08,
      center,
      center,
      radius
    );
    sphereGrad.addColorStop(0, '#fef9c3');
    sphereGrad.addColorStop(0.35, '#facc15');
    sphereGrad.addColorStop(0.82, '#eab308');
    sphereGrad.addColorStop(1, '#a16207');

    ctx.fillStyle = sphereGrad;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();

    // Subtle crisp outline so it stands out even over yellow highlights
    ctx.strokeStyle = 'rgba(24, 24, 27, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(center, center, radius - 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.name = 'pavabim-orbit-center-marker';
  sprite.visible = false;
  sprite.frustumCulled = false;
  sprite.renderOrder = 60;

  return {
    sprite,
    dispose: () => {
      sprite.removeFromParent();
      material.dispose();
      texture.dispose();
    },
  };
}

function updateOrbitMarkerScale(
  marker: THREE.Object3D,
  camera: THREE.Camera,
  domElement: HTMLElement
): void {
  const viewportHeight = Math.max(1, domElement.clientHeight);
  let worldHeight = 1;
  if (camera instanceof THREE.OrthographicCamera) {
    worldHeight = Math.abs(camera.top - camera.bottom) / Math.max(1e-6, camera.zoom);
  } else if (camera instanceof THREE.PerspectiveCamera) {
    const distance = Math.max(0.01, camera.position.distanceTo(marker.position));
    worldHeight =
      (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) /
      Math.max(1e-6, camera.zoom);
  }
  const worldSize = worldHeight * (ORBIT_MARKER_PIXEL_SIZE / viewportHeight);
  marker.scale.set(worldSize, worldSize, 1);
}

function resolvePlaneOrbitAnchor(
  world: OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>,
  fragments: OBC.FragmentsManager,
  ndc: THREE.Vector2
): THREE.Vector3 | null {
  if (!world.camera.hasCameraControls()) return null;
  const camera = world.camera.three;
  const controls = world.camera.controls;
  camera.updateMatrixWorld();

  WHEEL_ZOOM_RAYCASTER.setFromCamera(ndc, camera);
  const ray = WHEEL_ZOOM_RAYCASTER.ray;
  const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();

  const currentTarget = controls.getTarget(new THREE.Vector3(), false);
  let refDepth = currentTarget.clone().sub(camera.position).dot(forward);
  let refPoint: THREE.Vector3;

  if (refDepth > 0.25) {
    refPoint = currentTarget;
  } else {
    const bounds = getVisibleModelsBounds(fragments);
    const boundsCenter = bounds?.getCenter(new THREE.Vector3()) ?? null;
    const boundsDepth = boundsCenter
      ? boundsCenter.clone().sub(camera.position).dot(forward)
      : -1;
    if (boundsCenter && boundsDepth > 0.25) {
      refPoint = boundsCenter;
      refDepth = boundsDepth;
    } else {
      refDepth = Math.max(5, controls.distance);
      refPoint = camera.position.clone().addScaledVector(forward, refDepth);
    }
  }

  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, refPoint);
  const hit = ray.intersectPlane(plane, new THREE.Vector3());
  if (hit && hit.clone().sub(ray.origin).dot(ray.direction) > 0.05) {
    return hit;
  }
  return ray.origin.clone().addScaledVector(ray.direction, Math.max(1, refDepth));
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

const WHEEL_ZOOM_RAYCASTER = new THREE.Raycaster();

function applyCursorWheelZoom(
  event: WheelEvent,
  components: OBC.Components,
  world: OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>,
  domElement: HTMLCanvasElement,
  orthoZoomTargetRef: React.MutableRefObject<number | null>
): boolean {
  if (!world.camera.hasCameraControls()) return false;
  const controls = world.camera.controls;
  if (!controls.enabled) return false;

  const wheelAction = event.ctrlKey
    ? CameraControls.ACTION.ZOOM
    : controls.mouseButtons.wheel;
  if (
    wheelAction !== CameraControls.ACTION.DOLLY &&
    wheelAction !== CameraControls.ACTION.ZOOM
  ) {
    return false;
  }

  const bounds = domElement.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return false;

  const ndc = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );

  const isMac = /Mac|iPod|iPhone|iPad/i.test(navigator.platform);
  const deltaYFactor = isMac ? -1 : -3;
  const rawDeltaY =
    event.deltaMode === 2 ? event.deltaY * 100 : event.deltaY;
  const rawDelta =
    event.deltaMode === 1 && !event.ctrlKey
      ? rawDeltaY / deltaYFactor
      : rawDeltaY / (deltaYFactor * 10);
  const delta = THREE.MathUtils.clamp(rawDelta, -12, 12);
  if (Math.abs(delta) < 1e-6) return true;

  // Absorb any focalOffset left by off-center orbit anchoring without moving the camera view.
  recenterFocalOffsetPreservingView(controls, world.camera.three);

  // Orthographic camera zooms via camera.zoom and shifts target to keep the pointer point stationary.
  if (
    world.camera.projection.current === 'Orthographic' &&
    world.camera.three instanceof THREE.OrthographicCamera
  ) {
    const orthoCam = world.camera.three;
    const zoomScale = Math.pow(0.95, -delta * controls.dollySpeed);
    const currentZoomTarget = orthoZoomTargetRef.current ?? orthoCam.zoom;
    const nextZoom = THREE.MathUtils.clamp(
      currentZoomTarget * zoomScale,
      controls.minZoom,
      controls.maxZoom
    );
    orthoZoomTargetRef.current = nextZoom;

    orthoCam.updateMatrixWorld();
    const rightVec = new THREE.Vector3()
      .setFromMatrixColumn(orthoCam.matrixWorld, 0)
      .normalize();
    const upVec = new THREE.Vector3()
      .setFromMatrixColumn(orthoCam.matrixWorld, 1)
      .normalize();

    const halfW = (orthoCam.right - orthoCam.left) * 0.5;
    const halfH = (orthoCam.top - orthoCam.bottom) * 0.5;
    const zoomDeltaInv = 1 / currentZoomTarget - 1 / nextZoom;
    const offsetX =
      ((orthoCam.left + orthoCam.right) * 0.5 + ndc.x * halfW) * zoomDeltaInv;
    const offsetY =
      ((orthoCam.bottom + orthoCam.top) * 0.5 + ndc.y * halfH) * zoomDeltaInv;

    const endTarget = controls.getTarget(new THREE.Vector3(), true);
    endTarget.addScaledVector(rightVec, offsetX).addScaledVector(upVec, offsetY);

    void controls.moveTo(endTarget.x, endTarget.y, endTarget.z, true);
    void controls.zoomTo(nextZoom, true);
    return true;
  }

  // Perspective camera zooms along the 3D ray under the cursor towards the picked surface point.
  const endPos = controls.getPosition(new THREE.Vector3(), true);
  const endTarget = controls.getTarget(new THREE.Vector3(), true);
  const viewDir = new THREE.Vector3().subVectors(endTarget, endPos);
  const currentRadius = viewDir.length();
  if (currentRadius < 1e-6) {
    world.camera.three.getWorldDirection(viewDir);
  } else {
    viewDir.divideScalar(currentRadius);
  }

  WHEEL_ZOOM_RAYCASTER.setFromCamera(ndc, world.camera.three);
  const rayDir = WHEEL_ZOOM_RAYCASTER.ray.direction.clone().normalize();
  const dollyScale = Math.pow(0.95, delta * controls.dollySpeed);
  const hitPoint = resolveSyncSurfacePoint(components, world, ndc);

  let targetDepth = Math.max(
    controls.minDistance,
    new THREE.Vector3().subVectors(endTarget, endPos).dot(viewDir)
  );
  const hitPerpFromEnd = hitPoint
    ? new THREE.Vector3().subVectors(hitPoint, endPos).dot(viewDir)
    : -1;
  let anchorPoint: THREE.Vector3;

  if (hitPoint && hitPerpFromEnd > 0.01) {
    anchorPoint = hitPoint;
  } else {
    const cosAngle = Math.max(0.15, rayDir.dot(viewDir));
    const fallbackDist = Math.max(1, targetDepth) / cosAngle;
    anchorPoint = endPos.clone().addScaledVector(rayDir, fallbackDist);
  }

  const anchorVec = new THREE.Vector3().subVectors(endPos, anchorPoint);
  const distToAnchor = anchorVec.length();
  let newPos: THREE.Vector3;

  if (dollyScale < 1 && distToAnchor <= 0.15) {
    // Allow gliding past close surfaces instead of stalling asymptotically against walls.
    const step = Math.max(distToAnchor, 0.25) * (1 - dollyScale);
    newPos = endPos.clone().addScaledVector(rayDir, step);
    targetDepth = Math.max(0.5, targetDepth);
  } else if (dollyScale > 1 && distToAnchor < 0.25) {
    const step = Math.max(distToAnchor, 0.25) * (dollyScale - 1);
    newPos = endPos.clone().addScaledVector(rayDir, -step);
    targetDepth = Math.max(0.5, targetDepth * dollyScale);
  } else {
    newPos = anchorPoint.clone().addScaledVector(anchorVec, dollyScale);
    if (hitPoint && hitPerpFromEnd > 0.01) {
      const perpToHit = new THREE.Vector3()
        .subVectors(hitPoint, newPos)
        .dot(viewDir);
      targetDepth =
        perpToHit > controls.minDistance
          ? perpToHit
          : Math.max(controls.minDistance, targetDepth * dollyScale);
    } else {
      targetDepth = Math.max(controls.minDistance, targetDepth * dollyScale);
    }
  }

  const nextTarget = newPos.clone().addScaledVector(viewDir, targetDepth);
  void controls.moveTo(nextTarget.x, nextTarget.y, nextTarget.z, true);
  void controls.dollyTo(targetDepth, true);
  return true;
}

export const EngineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isEngineReady, setIsEngineReady] = useState(false);

  const initSessionRef = useRef<number>(0);
  const anchorRequestIdRef = useRef<number>(0);
  const selectionRequestIdRef = useRef<number>(0);
  const orthoZoomTargetRef = useRef<number | null>(null);
  const pointerOrbitCleanupRef = useRef<(() => void) | null>(null);
  const volumeMetricCacheRef = useRef<
    Map<string, { volume: number; center: THREE.Vector3 }>
  >(new Map());
  const componentsRef = useRef<OBC.Components | null>(null);
  const worldRef = useRef<OBC.SimpleWorld<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBCF.RendererWith2D
  > | null>(null);
  const fragmentsRef = useRef<OBC.FragmentsManager | null>(null);
  const highlighterRef = useRef<OBCF.Highlighter | null>(null);
  const clipperRef = useRef<OBC.Clipper | null>(null);
  const lengthMeasurementRef = useRef<OBCF.LengthMeasurement | null>(null);
  const gridRef = useRef<OBC.SimpleGrid | null>(null);
  const [measurementCount, setMeasurementCount] = useState(0);
  const measureOverlayRef = useRef<{
    root: THREE.Group;
    hoverEdgeLine: Line2;
    anchorEdgeLine: Line2;
    hoverFaceFill: THREE.Mesh;
    hoverFaceOutline: Line2;
    anchorFaceFill: THREE.Mesh;
    anchorFaceOutline: Line2;
    hoverFaceDisk: THREE.Mesh;
    hoverFaceRing: THREE.LineLoop;
    hoverAreaFill: THREE.Mesh;
    hoverAreaOutline: Line2;
    previewGuides: THREE.LineSegments;
    previewDim: OBCF.DimensionLine;
    permanentGuidesGroup: THREE.Group;
    permanentGuidesMat: THREE.LineDashedMaterial;
    committedLines: OBCF.Line[];
    permanentGuidesByLine: Map<OBCF.Line, THREE.LineSegments>;
    areaGroup: THREE.Group;
    areaBadgeMap: Map<string, MeasureBadgeEntry>;
    areaDisposables: { dispose: () => void }[];
    volumeGroup: THREE.Group;
    volumeBadgeMap: Map<string, MeasureBadgeEntry>;
    dispose: () => void;
  } | null>(null);

  const {
    activeTool,
    setSelectedElements,
    addHiddenElements,
    removeHiddenElements,
    setIsolationActive,
    clearHiddenElements,
    setModelLoading,
    addLoadedModel,
    removeLoadedModel,
    clearLoadedModels,
    setModelVisibility: setStoreModelVisibility,
    showAllModels: showAllStoreModels,
    toggleGrid: toggleStoreGrid,
    toggleSection: toggleStoreSection,
    setSectionActive: setStoreSectionActive,
    setSectionGizmosVisible: setStoreSectionGizmosVisible,
    setActiveTool: setStoreActiveTool,
    setCameraProjection: setStoreCameraProjection,
    currentProjectId,
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
          OBCF.RendererWith2D
        >();
        worldRef.current = world;

        // Scene, Renderer (with CSS2DRenderer for measurement labels) & Camera setup
        world.scene = new OBC.SimpleScene(components);
        const renderer2D = new OBCF.RendererWith2D(components, container, {
          preserveDrawingBuffer: true,
          antialias: true,
        });
        renderer2D.three2D.domElement.style.zIndex = '5';
        world.renderer = renderer2D;
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
          backgroundColor: new THREE.Color(0x18191c), // Dark charcoal / slate viewport background
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
            orthoZoomTargetRef.current = null;
            syncCameraNearPlane();
            setStoreCameraProjection(world.camera.projection.current);
            if (fragments.initialized) {
              for (const [, model] of fragments.list) {
                model.useCamera(camera);
              }
              void fragments.core.update(true);
            }
            if (clipperRef.current) {
              for (const [, plane] of clipperRef.current.list) {
                plane.controls.camera = camera;
              }
            }
          });
        setStoreCameraProjection(world.camera.projection.current);

        // Trigger LOD / fragments redraw on camera rest
        world.camera.controls.addEventListener('rest', () => {
          orthoZoomTargetRef.current = null;
          if (fragments.initialized) {
            fragments.core.update(true);
          }
        });
        world.camera.controls.addEventListener('controlstart', () => {
          orthoZoomTargetRef.current = null;
        });

        // Capture-phase left-button orbit anchoring & cursor wheel zoom BEFORE camera-controls handles input
        const domElement = world.renderer.three.domElement;
        const orbitCenterMarker = createOrbitCenterMarker();
        world.scene.three.add(orbitCenterMarker.sprite);
        const currentOrbitAnchor = new THREE.Vector3(0, 0, 0);
        let activeOrbitDragCleanup: (() => void) | null = null;

        const syncOrbitMarkerScale = () => {
          if (!orbitCenterMarker.sprite.visible) return;
          updateOrbitMarkerScale(orbitCenterMarker.sprite, world.camera.three, domElement);
        };
        world.camera.controls.addEventListener('update', syncOrbitMarkerScale);

        const setOrbitAnchorPoint = (controls: CameraControls, point: THREE.Vector3) => {
          applyOrbitAnchor(controls, point);
          currentOrbitAnchor.copy(point);
          orbitCenterMarker.sprite.position.copy(point);
          updateOrbitMarkerScale(orbitCenterMarker.sprite, world.camera.three, domElement);
        };

        const handleOrbitAnchorPointerDown = (event: PointerEvent) => {
          if (event.button !== 0 || activeToolRef.current === 'pan') return;
          if (clipperRef.current) {
            for (const [, plane] of clipperRef.current.list) {
              if (plane.controls.enabled && plane.controls.axis !== null) {
                return;
              }
            }
          }
          const currentWorld = worldRef.current;
          if (!currentWorld?.camera.hasCameraControls()) return;
          const controls = currentWorld.camera.controls;
          if (!controls.enabled) return;

          const bounds = domElement.getBoundingClientRect();
          if (bounds.width <= 0 || bounds.height <= 0) return;

          activeOrbitDragCleanup?.();

          // Default to current camera-controls pivot in case no surface/plane intersection exists
          const currCenter = controls.getPosition(new THREE.Vector3(), false);
          const currTarget = controls.getTarget(new THREE.Vector3(), false);
          const currFocal = controls.getFocalOffset(new THREE.Vector3(), false);
          const fallbackPivot = currTarget
            .clone()
            .add(
              computeWorldFocalOffset(
                currCenter,
                currTarget,
                currFocal,
                currentWorld.camera.three.up
              )
            );
          currentOrbitAnchor.copy(fallbackPivot);
          orbitCenterMarker.sprite.position.copy(fallbackPivot);

          const ndc = new THREE.Vector2(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            -((event.clientY - bounds.top) / bounds.height) * 2 + 1
          );

          const requestId = ++anchorRequestIdRef.current;
          const startX = event.clientX;
          const startY = event.clientY;
          let dragStarted = false;

          const cleanupOrbitDragListeners = () => {
            window.removeEventListener('pointermove', onMoveCheck, { capture: true });
            window.removeEventListener('pointerup', onUpCheck, { capture: true });
            window.removeEventListener('pointercancel', onUpCheck, { capture: true });
            window.removeEventListener('blur', onUpCheck);
            if (activeOrbitDragCleanup === cleanupOrbitDragListeners) {
              activeOrbitDragCleanup = null;
            }
          };

          const onMoveCheck = (moveEvt: PointerEvent) => {
            if (
              !currentWorld.camera.hasCameraControls() ||
              !currentWorld.camera.controls.enabled ||
              activeToolRef.current === 'pan'
            ) {
              orbitCenterMarker.sprite.visible = false;
              dragStarted = true;
              cleanupOrbitDragListeners();
              return;
            }
            if (Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY) > 2) {
              dragStarted = true;
              if (!orbitCenterMarker.sprite.visible) {
                orbitCenterMarker.sprite.position.copy(currentOrbitAnchor);
                updateOrbitMarkerScale(
                  orbitCenterMarker.sprite,
                  currentWorld.camera.three,
                  domElement
                );
                orbitCenterMarker.sprite.visible = true;
                currentWorld.renderer?.update();
              }
            }
          };

          const onUpCheck = () => {
            dragStarted = true;
            if (orbitCenterMarker.sprite.visible) {
              orbitCenterMarker.sprite.visible = false;
              currentWorld.renderer?.update();
            }
            cleanupOrbitDragListeners();
          };

          activeOrbitDragCleanup = cleanupOrbitDragListeners;
          window.addEventListener('pointermove', onMoveCheck, { capture: true });
          window.addEventListener('pointerup', onUpCheck, { capture: true });
          window.addEventListener('pointercancel', onUpCheck, { capture: true });
          window.addEventListener('blur', onUpCheck);

          const syncPoint = resolveSyncSurfacePoint(components, currentWorld, ndc);
          if (syncPoint) {
            setOrbitAnchorPoint(controls, syncPoint);
            return;
          }

          // Pivot immediately along the pointer ray even over empty space / edges so orbit never uses a stale distant point.
          const planePoint = resolvePlaneOrbitAnchor(currentWorld, fragments, ndc);
          if (planePoint) {
            setOrbitAnchorPoint(controls, planePoint);
          }

          const clientPos = new THREE.Vector2(startX, startY);
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
              dragStarted ||
              requestId !== anchorRequestIdRef.current ||
              sessionId !== initSessionRef.current ||
              currentWorld.isDisposing ||
              activeToolRef.current === 'pan' ||
              !currentWorld.camera.hasCameraControls()
            ) {
              return;
            }
            setOrbitAnchorPoint(currentWorld.camera.controls, asyncPoint);
          });
        };

        const handleWheelZoomToCursor = (event: WheelEvent) => {
          const currentWorld = worldRef.current;
          if (!currentWorld || currentWorld.isDisposing) return;
          const handled = applyCursorWheelZoom(
            event,
            components,
            currentWorld,
            domElement,
            orthoZoomTargetRef
          );
          if (handled) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        };

        pointerOrbitCleanupRef.current?.();
        domElement.addEventListener('pointerdown', handleOrbitAnchorPointerDown, {
          capture: true,
        });
        domElement.addEventListener('wheel', handleWheelZoomToCursor, {
          capture: true,
          passive: false,
        });
        pointerOrbitCleanupRef.current = () => {
          activeOrbitDragCleanup?.();
          world.camera.controls.removeEventListener('update', syncOrbitMarkerScale);
          orbitCenterMarker.dispose();
          domElement.removeEventListener('pointerdown', handleOrbitAnchorPointerDown, {
            capture: true,
          });
          domElement.removeEventListener('wheel', handleWheelZoomToCursor, {
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
        highlighter.styles.set('measure-volume', {
          color: new THREE.Color(0x10b981),
          renderedFaces: 0,
          opacity: 0.82,
          transparent: true,
        });
        highlighter.styles.set('measure-volume-hover', {
          color: new THREE.Color(0x38bdf8),
          renderedFaces: 0,
          opacity: 0.45,
          transparent: true,
        });

        const syncHighlighterSelection = async (rawSelection?: OBC.ModelIdMap) => {
          const requestId = ++selectionRequestIdRef.current;
          const source = rawSelection ?? {};
          const normalizedMap: Record<string, number[]> = {};
          let primaryModelId: string | null = null;
          let primaryExpressId: number | undefined;

          for (const [modelId, rawIds] of Object.entries(source)) {
            const ids = Array.from(
              new Set(
                (Array.isArray(rawIds) ? rawIds : Array.from(rawIds as Set<number>)).filter(
                  (id): id is number => typeof id === 'number' && Number.isFinite(id),
                ),
              ),
            );
            if (ids.length === 0) continue;
            normalizedMap[modelId] = ids;
            if (!primaryModelId) {
              primaryModelId = modelId;
              primaryExpressId = ids[0];
            }
          }

          if (!primaryModelId || primaryExpressId === undefined) {
            setSelectedElements({}, null, null, null);
            return;
          }

          const elementStr = String(primaryExpressId);
          let props: Record<string, any> | null = null;
          try {
            const allItems: Record<string, unknown>[] = [];
            const SELECTION_PROPS_CHUNK_SIZE = 200;

            for (const [modelId, ids] of Object.entries(normalizedMap)) {
              const model = fragments.list.get(modelId);
              if (!model) continue;

              for (let i = 0; i < ids.length; i += SELECTION_PROPS_CHUNK_SIZE) {
                if (
                  requestId !== selectionRequestIdRef.current ||
                  sessionId !== initSessionRef.current
                ) {
                  return;
                }
                const chunkIds = ids.slice(i, i + SELECTION_PROPS_CHUNK_SIZE);
                const chunkData = await model.getItemsData(chunkIds);
                for (const item of chunkData) {
                  if (item && typeof item === 'object') {
                    allItems.push(item as Record<string, unknown>);
                  }
                }
              }
            }

            if (allItems.length === 1) {
              props = allItems[0];
            } else if (allItems.length > 1) {
              props = mergeMultipleElementProperties(
                allItems,
                allItems.length,
              );
            }
          } catch (e) {
            console.warn('[EngineContext] Could not fetch element properties:', e);
          }

          if (
            requestId !== selectionRequestIdRef.current ||
            sessionId !== initSessionRef.current
          ) {
            return;
          }

          setSelectedElements(normalizedMap, elementStr, primaryModelId, props);
        };

        // Listen for selection changes
        highlighter.events.select.onHighlight.add((selection: OBC.ModelIdMap) => {
          void syncHighlighterSelection(highlighter.selection.select || selection);
        });

        highlighter.events.select.onClear.add(() => {
          void syncHighlighterSelection(highlighter.selection.select || {});
        });

        // Clipper setup
        const clipper = components.get(OBC.Clipper);
        clipper.enabled = false;
        clipper.localClippingPlanes = true;
        for (const [, material] of fragments.core.models.materials.list) {
          material.clippingPlanes = world.renderer.clippingPlanes;
        }
        clipper.onAfterDrag.add(() => {
          world.renderer?.updateClippingPlanes();
          void fragmentsRef.current?.core.update(true);
        });
        clipperRef.current = clipper;

        // Length Measurement setup (visual lines + labels rendered via OBCF.LengthMeasurement,
        // driven by unified Vértice / Arista / Plano screen-space snap)
        const lengthMeasurement = components.get(OBCF.LengthMeasurement);
        const MeasurementClass = OBCF.Measurement as typeof OBCF.Measurement & {
          valueFormatter?: (value: number) => string;
        };
        MeasurementClass.valueFormatter = (value: number) => {
          const rounding = (lengthMeasurement as { rounding?: number }).rounding;
          const decimals = typeof rounding === 'number' && Number.isInteger(rounding) ? rounding : 3;
          return formatDecimalEs(value, decimals);
        };
        lengthMeasurement.world = world;
        lengthMeasurement.enabled = false;
        lengthMeasurement.rounding = 3;
        lengthMeasurement.lineType = OBCF.MeasurementLineType.Fat;
        lengthMeasurement.lineWidth = 2.5;
        lengthMeasurement.color = new THREE.Color('#0284c7');
        lengthMeasurementRef.current = lengthMeasurement;

        const applyDimLabelStyle = (dim: OBCF.DimensionLine) => {
          const el = dim.label.three.element;
          el.style.fontSize = '12px';
          el.style.fontWeight = '600';
          el.style.fontVariantNumeric = 'tabular-nums';
          el.style.padding = '3px 7px';
          el.style.borderRadius = '5px';
          el.style.whiteSpace = 'nowrap';
          el.style.lineHeight = '1.2';
          el.style.zIndex = '5';
        };

        lengthMeasurement.lines.onItemAdded.add((dim) => {
          applyDimLabelStyle(dim);
        });

        const syncMeasurementCount = () => {
          setMeasurementCount(lengthMeasurement.list.size);
        };
        lengthMeasurement.list.onItemAdded.add(syncMeasurementCount);
        lengthMeasurement.list.onBeforeDelete.add(syncMeasurementCount);
        lengthMeasurement.list.onCleared.add(syncMeasurementCount);
        syncMeasurementCount();

        // Dedicated 3D overlay for snap highlights (full edges, full face planes, live dimension preview & guides)
        const overlayRoot = new THREE.Group();
        overlayRoot.name = 'pavabim-measure-overlay';
        overlayRoot.renderOrder = 50;

        const rendererSize = renderer2D.getSize();
        const createFatHighlightLine = (colorHex: number, linewidth: number) => {
          const geo = new LineGeometry();
          geo.setPositions([0, 0, 0, 0, 0, 0]);
          const mat = new LineMaterial({
            color: colorHex,
            linewidth,
            worldUnits: false,
            depthTest: false,
            transparent: true,
            opacity: 0.98,
            resolution: new THREE.Vector2(rendererSize.x || 1, rendererSize.y || 1),
          });
          const lineObj = new Line2(geo, mat);
          lineObj.visible = false;
          lineObj.frustumCulled = false;
          lineObj.renderOrder = 55;
          return { lineObj, geo, mat };
        };

        const {
          lineObj: hoverEdgeLine,
          geo: hoverEdgeGeo,
          mat: hoverEdgeMat,
        } = createFatHighlightLine(0x38bdf8, 3.5);

        const {
          lineObj: anchorEdgeLine,
          geo: anchorEdgeGeo,
          mat: anchorEdgeMat,
        } = createFatHighlightLine(0xfacc15, 3.5);

        const {
          lineObj: hoverFaceOutline,
          geo: hoverFaceOutlineGeo,
          mat: hoverFaceOutlineMat,
        } = createFatHighlightLine(0xc084fc, 2.5);
        hoverFaceOutline.renderOrder = 54;

        const {
          lineObj: anchorFaceOutline,
          geo: anchorFaceOutlineGeo,
          mat: anchorFaceOutlineMat,
        } = createFatHighlightLine(0xfacc15, 2.5);
        anchorFaceOutline.renderOrder = 54;

        const hoverFaceFillGeo = new THREE.BufferGeometry();
        hoverFaceFillGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3));
        const hoverFaceFillMat = new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          side: THREE.DoubleSide,
          depthTest: false,
          transparent: true,
          opacity: 0.24,
        });
        const hoverFaceFill = new THREE.Mesh(hoverFaceFillGeo, hoverFaceFillMat);
        hoverFaceFill.visible = false;
        hoverFaceFill.frustumCulled = false;
        hoverFaceFill.renderOrder = 53;

        const anchorFaceFillGeo = new THREE.BufferGeometry();
        anchorFaceFillGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3));
        const anchorFaceFillMat = new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          side: THREE.DoubleSide,
          depthTest: false,
          transparent: true,
          opacity: 0.2,
        });
        const anchorFaceFill = new THREE.Mesh(anchorFaceFillGeo, anchorFaceFillMat);
        anchorFaceFill.visible = false;
        anchorFaceFill.frustumCulled = false;
        anchorFaceFill.renderOrder = 53;

        const hoverFaceDiskGeo = new THREE.CircleGeometry(1, 24);
        const hoverFaceDiskMat = new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          side: THREE.DoubleSide,
          depthTest: false,
          transparent: true,
          opacity: 0.22,
        });
        const hoverFaceDisk = new THREE.Mesh(hoverFaceDiskGeo, hoverFaceDiskMat);
        hoverFaceDisk.visible = false;
        hoverFaceDisk.frustumCulled = false;
        hoverFaceDisk.renderOrder = 53;

        const ringPoints: THREE.Vector3[] = [];
        for (let i = 0; i < 24; i++) {
          const theta = (i / 24) * Math.PI * 2;
          ringPoints.push(new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0));
        }
        const hoverFaceRingGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
        const hoverFaceRingMat = new THREE.LineBasicMaterial({
          color: 0xc084fc,
          depthTest: false,
          transparent: true,
          opacity: 0.92,
        });
        const hoverFaceRing = new THREE.LineLoop(hoverFaceRingGeo, hoverFaceRingMat);
        hoverFaceRing.visible = false;
        hoverFaceRing.frustumCulled = false;
        hoverFaceRing.renderOrder = 54;

        const {
          lineObj: hoverAreaOutline,
          geo: hoverAreaOutlineGeo,
          mat: hoverAreaOutlineMat,
        } = createFatHighlightLine(0x38bdf8, 2.5);
        hoverAreaOutline.renderOrder = 54;

        const hoverAreaFillGeo = new THREE.BufferGeometry();
        hoverAreaFillGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3));
        const hoverAreaFillMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
          depthTest: false,
          transparent: true,
          opacity: 0.24,
        });
        const hoverAreaFill = new THREE.Mesh(hoverAreaFillGeo, hoverAreaFillMat);
        hoverAreaFill.visible = false;
        hoverAreaFill.frustumCulled = false;
        hoverAreaFill.renderOrder = 53;

        const syncHighlightResolution = ({ x, y }: THREE.Vector2) => {
          const rx = x || 1;
          const ry = y || 1;
          hoverEdgeMat.resolution.set(rx, ry);
          anchorEdgeMat.resolution.set(rx, ry);
          hoverFaceOutlineMat.resolution.set(rx, ry);
          anchorFaceOutlineMat.resolution.set(rx, ry);
          hoverAreaOutlineMat.resolution.set(rx, ry);
        };
        renderer2D.onResize.add(syncHighlightResolution);

        const previewGuidesGeo = new THREE.BufferGeometry();
        previewGuidesGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3));
        const previewGuidesMat = new THREE.LineDashedMaterial({
          color: 0x94a3b8,
          dashSize: 0.14,
          gapSize: 0.08,
          depthTest: false,
          transparent: true,
          opacity: 0.85,
        });
        const previewGuides = new THREE.LineSegments(previewGuidesGeo, previewGuidesMat);
        previewGuides.visible = false;
        previewGuides.frustumCulled = false;
        previewGuides.renderOrder = 54;

        const permanentGuidesGroup = new THREE.Group();
        permanentGuidesGroup.name = 'pavabim-measure-permanent-guides';
        permanentGuidesGroup.renderOrder = 52;
        const permanentGuidesMat = new THREE.LineDashedMaterial({
          color: 0x94a3b8,
          dashSize: 0.14,
          gapSize: 0.08,
          depthTest: false,
          transparent: true,
          opacity: 0.7,
        });

        const previewDim = new OBCF.DimensionLine(
          components,
          world,
          {
            line: new OBCF.Line(),
            lineMaterial: lengthMeasurement.linesMaterial,
            endpointElement: lengthMeasurement.linesEndpointElement,
          },
          lengthMeasurement.rounding,
          lengthMeasurement.units as 'mm' | 'cm' | 'm' | 'km'
        );
        applyDimLabelStyle(previewDim);
        previewDim.visible = false;

        const areaGroup = new THREE.Group();
        areaGroup.name = 'pavabim-measure-area-overlay';
        areaGroup.renderOrder = 53;

        const volumeGroup = new THREE.Group();
        volumeGroup.name = 'pavabim-measure-volume-overlay';
        volumeGroup.renderOrder = 55;

        overlayRoot.add(
          hoverEdgeLine,
          anchorEdgeLine,
          hoverFaceFill,
          hoverFaceOutline,
          anchorFaceFill,
          anchorFaceOutline,
          hoverFaceDisk,
          hoverFaceRing,
          hoverAreaFill,
          hoverAreaOutline,
          previewGuides,
          permanentGuidesGroup,
          areaGroup,
          volumeGroup
        );
        world.scene.three.add(overlayRoot);

        const committedLines: OBCF.Line[] = [];
        const permanentGuidesByLine = new Map<OBCF.Line, THREE.LineSegments>();
        const areaBadgeMap = new Map<string, MeasureBadgeEntry>();
        const areaDisposables: { dispose: () => void }[] = [];
        const volumeBadgeMap = new Map<string, MeasureBadgeEntry>();

        measureOverlayRef.current = {
          root: overlayRoot,
          hoverEdgeLine,
          anchorEdgeLine,
          hoverFaceFill,
          hoverFaceOutline,
          anchorFaceFill,
          anchorFaceOutline,
          hoverFaceDisk,
          hoverFaceRing,
          hoverAreaFill,
          hoverAreaOutline,
          previewGuides,
          previewDim,
          permanentGuidesGroup,
          permanentGuidesMat,
          committedLines,
          permanentGuidesByLine,
          areaGroup,
          areaBadgeMap,
          areaDisposables,
          volumeGroup,
          volumeBadgeMap,
          dispose: () => {
            renderer2D.onResize.remove(syncHighlightResolution);
            try {
              previewDim.dispose();
            } catch {
              // ignore dispose errors during teardown
            }
            for (const lineObj of permanentGuidesByLine.values()) {
              lineObj.geometry.dispose();
            }
            permanentGuidesByLine.clear();
            committedLines.length = 0;
            for (const badge of areaBadgeMap.values()) {
              badge.labelObj.element.remove();
              badge.labelObj.removeFromParent();
            }
            areaBadgeMap.clear();
            clearDynamicMeasureGroup(areaGroup, areaDisposables);
            for (const badge of volumeBadgeMap.values()) {
              badge.labelObj.element.remove();
              badge.labelObj.removeFromParent();
            }
            volumeBadgeMap.clear();
            volumeGroup.clear();
            permanentGuidesMat.dispose();
            hoverEdgeGeo.dispose();
            hoverEdgeMat.dispose();
            anchorEdgeGeo.dispose();
            anchorEdgeMat.dispose();
            hoverFaceFillGeo.dispose();
            hoverFaceFillMat.dispose();
            hoverFaceOutlineGeo.dispose();
            hoverFaceOutlineMat.dispose();
            hoverAreaFillGeo.dispose();
            hoverAreaFillMat.dispose();
            hoverAreaOutlineGeo.dispose();
            hoverAreaOutlineMat.dispose();
            anchorFaceFillGeo.dispose();
            anchorFaceFillMat.dispose();
            anchorFaceOutlineGeo.dispose();
            anchorFaceOutlineMat.dispose();
            hoverFaceDiskGeo.dispose();
            hoverFaceDiskMat.dispose();
            hoverFaceRingGeo.dispose();
            hoverFaceRingMat.dispose();
            previewGuidesGeo.dispose();
            previewGuidesMat.dispose();
            overlayRoot.removeFromParent();
          },
        };

        if (sessionId === initSessionRef.current) {
          setIsEngineReady(true);
        }
      } catch (err) {
        console.error('[EngineContext] Failed to initialize ThatOpen 3D Engine:', err);
      }
    },
    [setSelectedElements, setStoreCameraProjection]
  );

  // Sync active tool with engine components
  useEffect(() => {
    if (!isEngineReady || !worldRef.current) return;

    const world = worldRef.current;
    const controls = world.camera.controls;
    const highlighter = highlighterRef.current;
    const lengthMeasurement = lengthMeasurementRef.current;

    if (lengthMeasurement) {
      lengthMeasurement.enabled = false;
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
    selectionRequestIdRef.current++;
    orthoZoomTargetRef.current = null;
    volumeMetricCacheRef.current.clear();
    pointerOrbitCleanupRef.current?.();
    pointerOrbitCleanupRef.current = null;
    measureOverlayRef.current?.dispose();
    measureOverlayRef.current = null;
    setMeasurementCount(0);
    setIsEngineReady(false);
    setStoreSectionActive(false);
    setStoreSectionGizmosVisible(true);
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
  }, [
    clearLoadedModels,
    setStoreCameraProjection,
    setStoreSectionActive,
    setStoreSectionGizmosVisible,
  ]);

  const loadModelFromBuffer = useCallback(
    async (
      buffer: ArrayBuffer | Uint8Array,
      modelId: string,
      modelName: string,
      source: 'local' | 'remote' = 'remote',
      downloadUrl?: string,
      options?: LoadModelOptions
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

        const currentActiveProjectId =
          useViewerStore.getState().currentProjectId;
        const belongsToActiveProject =
          !options?.projectId || options.projectId === currentActiveProjectId;
        const initialVisible = belongsToActiveProject
          ? (options?.initialVisible ?? true)
          : false;

        setModelHierarchyVisibility(model, initialVisible);
        world.scene.three.add(model.object);
        if (world.renderer) {
          model.useClippingPlanes(world.renderer.clippingPlanes);
        }
        await fragments.core.update(true);

        addLoadedModel({
          id: modelId,
          name: modelName,
          visible: initialVisible,
          userVisible: options?.initialVisible ?? true,
          source,
          fragModifiedTime: options?.fragModifiedTime,
          projectId: options?.projectId,
          downloadUrl,
        });

        // Fit camera to loaded model only if it belongs to the active project
        if (belongsToActiveProject) {
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

              if (!options?.skipCameraFit) {
                await world.camera.controls.fitToBox(box, true, {
                  paddingLeft: 2,
                  paddingRight: 2,
                  paddingBottom: 2,
                  paddingTop: 2,
                });
                await fragments.core.update(true);
              }
            }
          } catch (err) {
            console.warn('[EngineContext] Camera fit error:', err);
          }
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
        setModelHierarchyVisibility(model, visible);
        void fragments.core.update(true);
      }
      setStoreModelVisibility(modelId, visible);
    },
    [setStoreModelVisibility]
  );

  const removeModel = useCallback(
    async (modelId: string) => {
      const fragments = fragmentsRef.current;
      const world = worldRef.current;
      if (!fragments || !world) return;

      const model = fragments.list.get(modelId);
      if (model) {
        const keyPrefix = `${modelId}:`;
        for (const cachedKey of volumeMetricCacheRef.current.keys()) {
          if (cachedKey.startsWith(keyPrefix)) {
            volumeMetricCacheRef.current.delete(cachedKey);
          }
        }
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

    orthoZoomTargetRef.current = null;
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

    orthoZoomTargetRef.current = null;
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

  const focusSelectionMap = useCallback(
    async (selectionByModel: Record<string, number[]>, zoomToSelection = false) => {
      const fragments = fragmentsRef.current;
      const highlighter = highlighterRef.current;
      if (!fragments || !highlighter) return;

      const selection: OBC.ModelIdMap = {};
      for (const [modelId, localIds] of Object.entries(selectionByModel)) {
        if (localIds.length > 0) {
          selection[modelId] = new Set(localIds);
        }
      }
      if (Object.keys(selection).length === 0) return;

      await highlighter.highlightByID('select', selection, true, zoomToSelection);
    },
    []
  );

  const toggleSelectionMap = useCallback(
    async (selectionByModel: Record<string, number[]>, zoomToSelection = false) => {
      const fragments = fragmentsRef.current;
      const highlighter = highlighterRef.current;
      if (!fragments || !highlighter) return;

      const current = useViewerStore.getState().selectedElementsMap;
      const nextMap: OBC.ModelIdMap = {};
      for (const [modelId, localIds] of Object.entries(current)) {
        if (localIds.length > 0) {
          nextMap[modelId] = new Set(localIds);
        }
      }

      let hasTarget = false;
      let allAlreadySelected = true;
      for (const [modelId, localIds] of Object.entries(selectionByModel)) {
        if (localIds.length === 0) continue;
        hasTarget = true;
        const existing = nextMap[modelId];
        if (!existing || localIds.some((id) => !existing.has(id))) {
          allAlreadySelected = false;
          break;
        }
      }
      if (!hasTarget) return;

      for (const [modelId, localIds] of Object.entries(selectionByModel)) {
        if (localIds.length === 0) continue;
        if (allAlreadySelected) {
          const existing = nextMap[modelId];
          if (!existing) continue;
          for (const id of localIds) {
            existing.delete(id);
          }
          if (existing.size === 0) {
            delete nextMap[modelId];
          }
        } else {
          const existing = nextMap[modelId] ?? new Set<number>();
          for (const id of localIds) {
            existing.add(id);
          }
          nextMap[modelId] = existing;
        }
      }

      if (Object.keys(nextMap).length === 0) {
        selectionRequestIdRef.current++;
        await highlighter.clear('select');
        setSelectedElements({}, null, null, null);
        return;
      }

      await highlighter.highlightByID('select', nextMap, true, zoomToSelection);
    },
    [setSelectedElements]
  );

  const focusElements = useCallback(
    async (modelId: string, localIds: number[], zoomToSelection = false) => {
      await focusSelectionMap({ [modelId]: localIds }, zoomToSelection);
    },
    [focusSelectionMap]
  );

  const focusElement = useCallback(
    async (modelId: string, localId: number) => {
      await focusElements(modelId, [localId], true);
    },
    [focusElements]
  );

  const clearSelection = useCallback(async () => {
    selectionRequestIdRef.current++;
    if (highlighterRef.current) {
      await highlighterRef.current.clear('select');
    }
    setSelectedElements({}, null, null, null);
  }, [setSelectedElements]);

  const hideSelectedElements = useCallback(
    async (keepSelection = false) => {
      const components = componentsRef.current;
      if (!components) return;

      const selectedMap = useViewerStore.getState().selectedElementsMap;
      const modelIdMap: OBC.ModelIdMap = {};
      for (const [modelId, localIds] of Object.entries(selectedMap)) {
        if (localIds.length > 0) {
          modelIdMap[modelId] = new Set(localIds);
        }
      }
      if (Object.keys(modelIdMap).length === 0) return;

      const hider = components.get(OBC.Hider);
      await hider.set(false, modelIdMap);
      addHiddenElements(selectedMap);
      if (!keepSelection) {
        await clearSelection();
      }
    },
    [addHiddenElements, clearSelection]
  );

  const toggleHideSelectedElements = useCallback(async () => {
    const components = componentsRef.current;
    if (!components) return;

    const { selectedElementsMap, hiddenElementsMap } = useViewerStore.getState();
    const modelIdMap: OBC.ModelIdMap = {};
    let totalSelected = 0;
    let hiddenSelectedCount = 0;

    for (const [modelId, localIds] of Object.entries(selectedElementsMap)) {
      if (localIds.length === 0) continue;
      modelIdMap[modelId] = new Set(localIds);
      totalSelected += localIds.length;
      const hiddenSet = new Set(hiddenElementsMap[modelId] ?? []);
      for (const id of localIds) {
        if (hiddenSet.has(id)) {
          hiddenSelectedCount++;
        }
      }
    }

    if (totalSelected === 0) return;

    const hider = components.get(OBC.Hider);
    // If all or some selected elements are currently hidden, toggle them to visible (show).
    // Otherwise, if none are hidden (or they are visible), hide them.
    const shouldMakeVisible = hiddenSelectedCount > 0;

    await hider.set(shouldMakeVisible, modelIdMap);

    if (shouldMakeVisible) {
      removeHiddenElements(selectedElementsMap);
    } else {
      addHiddenElements(selectedElementsMap);
    }
  }, [addHiddenElements, removeHiddenElements]);

  const isolateSelectedElements = useCallback(async () => {
    const components = componentsRef.current;
    if (!components) return;

    const selectedMap = useViewerStore.getState().selectedElementsMap;
    const modelIdMap: OBC.ModelIdMap = {};
    for (const [modelId, localIds] of Object.entries(selectedMap)) {
      if (localIds.length > 0) {
        modelIdMap[modelId] = new Set(localIds);
      }
    }
    if (Object.keys(modelIdMap).length === 0) return;

    const hider = components.get(OBC.Hider);
    await hider.set(false);
    await hider.set(true, modelIdMap);
    setIsolationActive(true);
  }, [setIsolationActive]);

  const showAllElements = useCallback(async () => {
    const components = componentsRef.current;
    if (!components) return;

    const fragments = fragmentsRef.current;
    const currentProjId = useViewerStore.getState().currentProjectId;
    const loadedModels = useViewerStore.getState().loadedModels;
    const modelMetaMap = new Map(loadedModels.map((m) => [m.id, m]));

    if (fragments && fragments.initialized) {
      let changed = false;
      for (const [id, model] of fragments.list) {
        const meta = modelMetaMap.get(id);
        const belongsToCurrent =
          !meta?.projectId || meta.projectId === currentProjId;
        if (belongsToCurrent) {
          setModelHierarchyVisibility(model, true);
          changed = true;
        }
      }
      if (changed) {
        await fragments.core.update(true);
      }
    }

    const hider = components.get(OBC.Hider);
    await hider.set(true);
    clearHiddenElements();
    showAllStoreModels();
  }, [clearHiddenElements, showAllStoreModels]);

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

    orthoZoomTargetRef.current = null;
    void world.camera.controls.setFocalOffset(0, 0, 0, true);
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

  const pickFaceAtClientPoint = useCallback(
    async (clientX: number, clientY: number): Promise<SurfaceFaceHit | null> => {
      const components = componentsRef.current;
      const world = worldRef.current;
      const domElement = world?.renderer?.three.domElement;
      if (!components || !world || !domElement) return null;

      const rect = domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const camera = world.camera.three;
      const camPos = camera.position;
      const raycaster = components.get(OBC.Raycasters).get(world);

      let bestPoint: THREE.Vector3 | null = null;
      let bestNormal: THREE.Vector3 | null = null;
      let bestDistSq = Infinity;

      if (world.renderer?.api !== 'webgpu') {
        const picker = components.get(OBC.FastModelPickers).get(world) as unknown as SyncFastModelPicker;
        if (typeof picker.pick === 'function') {
          const hit = picker.pick(ndc, { depth: true, normal: true });
          if (hit?.surface?.point && hit.normal && hit.normal.lengthSq() > 1e-6) {
            bestPoint = hit.surface.point.clone();
            bestNormal = hit.normal.clone().normalize();
            bestDistSq = camPos.distanceToSquared(bestPoint);
          }
        }
      }

      if (world.meshes.size > 0) {
        const meshHit = raycaster.castRayToObjects(Array.from(world.meshes), ndc);
        if (meshHit?.point && meshHit.face?.normal && meshHit.object) {
          const distSq = camPos.distanceToSquared(meshHit.point);
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestPoint = meshHit.point.clone();
            bestNormal = getMeshWorldNormal(
              meshHit.object,
              meshHit.face.normal,
              meshHit.instanceId
            );
          }
        }
      }

      if (!bestPoint || !bestNormal) {
        const castHit = await raycaster.castRay({ position: ndc }).catch(() => null);
        if (castHit?.point) {
          const rawNormal = castHit.normal
            ? castHit.normal.clone()
            : castHit.face?.normal && castHit.object
              ? getMeshWorldNormal(castHit.object, castHit.face.normal, castHit.instanceId)
              : null;
          if (rawNormal && rawNormal.lengthSq() > 1e-6) {
            bestPoint = castHit.point.clone();
            bestNormal = rawNormal.normalize();
          }
        }
      }

      if (!bestPoint || !bestNormal) return null;

      return {
        point: bestPoint,
        normal: orientOutwardNormal(bestNormal, bestPoint, camera),
      };
    },
    []
  );

  interface FragmentMapConversion {
    eastings?: number | null;
    northings?: number | null;
    orthogonalHeight?: number | null;
    xAxisAbscissa?: number | null;
    xAxisOrdinate?: number | null;
    scale?: number | null;
  }

  interface FragmentCrsInfo {
    name?: string | null;
    mapConversion?: FragmentMapConversion | null;
  }

  const modelCrsCache = new WeakMap<
    FRAGS.FragmentsModel,
    Promise<FragmentCrsInfo | null>
  >();

  const getModelCrsCached = async (
    model: FRAGS.FragmentsModel
  ): Promise<FragmentCrsInfo | null> => {
    const cached = modelCrsCache.get(model);
    if (cached) return cached;

    const modelWithCrs = model as FRAGS.FragmentsModel & {
      getCRS?: () => Promise<FragmentCrsInfo | null>;
    };
    const promise =
      typeof modelWithCrs.getCRS === 'function'
        ? modelWithCrs.getCRS().catch(() => null)
        : Promise.resolve(null);
    modelCrsCache.set(model, promise);
    return promise;
  };

  const resolveHitFragmentsModel = (
    fragments: OBC.FragmentsManager | null,
    hitFragments: unknown,
    hitObject: THREE.Object3D | undefined
  ): FRAGS.FragmentsModel | null => {
    if (!fragments) return null;

    if (
      hitFragments &&
      typeof hitFragments === 'object' &&
      'modelId' in hitFragments &&
      typeof (hitFragments as { modelId?: unknown }).modelId === 'string'
    ) {
      const modelId = (hitFragments as { modelId: string }).modelId;
      return fragments.list.get(modelId) ?? (hitFragments as FRAGS.FragmentsModel);
    }

    let current: THREE.Object3D | null = hitObject ?? null;
    while (current) {
      for (const model of fragments.list.values()) {
        if (model.object === current) return model;
      }
      current = current.parent;
    }

    if (fragments.baseCoordinationModel) {
      const baseModel = fragments.list.get(fragments.baseCoordinationModel);
      if (baseModel) return baseModel;
    }

    return fragments.list.values().next().value ?? null;
  };

  /**
   * Transforms a picked Three.js viewer world point back into true georeferenced
   * civil/BIM coordinates `(X = Easting, Y = Northing, Z = Elevation)` by:
   * 1. Undoing the model's `object.matrixWorld` (which includes multi-model `autoCoordinate` offsets).
   * 2. Applying the inverse of the model's `web-ifc` `COORDINATE_TO_ORIGIN` coordination matrix.
   * 3. Mapping Three.js Y-up (`x, y, z`) to IFC right-handed Z-up (`x, -z, y`).
   * 4. Applying `IfcMapConversion` when an IFC4/4.3 CRS shift/scale is defined on the model.
   */
  const worldPointToGeoreferenced = async (
    worldPoint: THREE.Vector3,
    model: FRAGS.FragmentsModel | null,
    fragments: OBC.FragmentsManager | null
  ): Promise<GeoreferencedCoordinates> => {
    const localPoint = worldPoint.clone();

    if (model) {
      model.object.updateMatrixWorld(true);
      localPoint.applyMatrix4(model.object.matrixWorld.clone().invert());

      const coordinationMatrix = await model.getCoordinationMatrix().catch(() => null);
      if (coordinationMatrix) {
        localPoint.applyMatrix4(coordinationMatrix.clone().invert());
      } else if (fragments?.baseCoordinationMatrix) {
        localPoint.applyMatrix4(fragments.baseCoordinationMatrix.clone().invert());
      }
    } else if (fragments?.baseCoordinationMatrix) {
      localPoint.applyMatrix4(fragments.baseCoordinationMatrix.clone().invert());
    }

    // Three.js (Y-up: +X East, +Y Up, -Z North) -> IFC/Civil Z-up (+X East, +Y North, +Z Elevation)
    let x = localPoint.x;
    let y = -localPoint.z;
    let z = localPoint.y;

    const crs = model ? await getModelCrsCached(model) : null;
    const mapConv = crs?.mapConversion;
    if (mapConv) {
      const eastings = Number(mapConv.eastings ?? 0) || 0;
      const northings = Number(mapConv.northings ?? 0) || 0;
      const orthogonalHeight = Number(mapConv.orthogonalHeight ?? 0) || 0;
      const scale = Number(mapConv.scale ?? 1) || 1;
      const hasMapTransform =
        Math.abs(eastings) > 1e-6 ||
        Math.abs(northings) > 1e-6 ||
        Math.abs(orthogonalHeight) > 1e-6 ||
        Math.abs(scale - 1) > 1e-6;

      if (hasMapTransform) {
        const ax = Number(mapConv.xAxisAbscissa ?? 1);
        const ay = Number(mapConv.xAxisOrdinate ?? 0);
        const axisLen = Math.hypot(ax, ay);
        const cosA = axisLen > 1e-9 ? ax / axisLen : 1;
        const sinA = axisLen > 1e-9 ? ay / axisLen : 0;

        const mappedX = eastings + scale * (x * cosA - y * sinA);
        const mappedY = northings + scale * (x * sinA + y * cosA);
        const mappedZ = orthogonalHeight + scale * z;
        x = mappedX;
        y = mappedY;
        z = mappedZ;
      }
    }

    return {
      x,
      y,
      z,
      crsName: crs?.name ?? null,
    };
  };

  const pickCoordinateAtClientPoint = useCallback(
    async (
      clientX: number,
      clientY: number
    ): Promise<PickedCoordinateResult | null> => {
      const components = componentsRef.current;
      const world = worldRef.current;
      const fragments = fragmentsRef.current;
      const domElement = world?.renderer?.three.domElement;
      if (!components || !world || !domElement) return null;

      const rect = domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = components.get(OBC.Raycasters).get(world);

      const castHit = await raycaster
        .castRay({
          position: ndc,
          snappingClasses: [FRAGS.SnappingClass.POINT],
        })
        .catch(() => null);

      if (castHit?.point) {
        const snappedToVertex =
          'snappingClass' in castHit &&
          castHit.snappingClass === FRAGS.SnappingClass.POINT;
        const hitFragments =
          'fragments' in castHit ? castHit.fragments : undefined;
        const hitObject =
          'object' in castHit
            ? (castHit.object as THREE.Object3D | undefined)
            : undefined;
        const model = resolveHitFragmentsModel(
          fragments,
          hitFragments,
          hitObject
        );
        const point = castHit.point.clone();
        const georeferencedPoint = await worldPointToGeoreferenced(
          point,
          model,
          fragments
        );
        return {
          point,
          georeferencedPoint,
          snappedToVertex,
        };
      }

      if (world.meshes.size > 0) {
        const meshHit = raycaster.castRayToObjects(Array.from(world.meshes), ndc);
        if (meshHit?.point) {
          const model = resolveHitFragmentsModel(
            fragments,
            undefined,
            meshHit.object
          );
          const point = meshHit.point.clone();
          const georeferencedPoint = await worldPointToGeoreferenced(
            point,
            model,
            fragments
          );
          return {
            point,
            georeferencedPoint,
            snappedToVertex: false,
          };
        }
      }

      return null;
    },
    []
  );

  const createSectionFromFace = useCallback(
    (point: THREE.Vector3, normal: THREE.Vector3) => {
      const clipper = clipperRef.current;
      const world = worldRef.current;
      if (!clipper || !world) return;

      const isGizmosVisible = useViewerStore.getState().isSectionGizmosVisible;
      clipper.enabled = true;
      clipper.visible = isGizmosVisible;
      const outwardNormal = orientOutwardNormal(normal, point, world.camera.three);
      const planeNormal = outwardNormal.clone().negate();
      const planeId = clipper.createFromNormalAndCoplanarPoint(
        world,
        planeNormal,
        point.clone()
      );
      const plane = clipper.list.get(planeId);
      if (plane) {
        plane.size = clipper.size;
        plane.visible = isGizmosVisible;
        plane.controls.enabled = isGizmosVisible;
        plane.controls.getHelper().visible = isGizmosVisible;
        plane.helper.visible = isGizmosVisible;
      }
      world.renderer?.updateClippingPlanes();
      void fragmentsRef.current?.core.update(true);
      setStoreSectionActive(clipper.list.size > 0);
    },
    [setStoreSectionActive]
  );

  const toggleSectionGizmosVisibility = useCallback(
    (visible?: boolean) => {
      const nextVisible =
        visible !== undefined
          ? visible
          : !useViewerStore.getState().isSectionGizmosVisible;
      setStoreSectionGizmosVisible(nextVisible);

      const clipper = clipperRef.current;
      if (!clipper) return;

      clipper.visible = nextVisible;
      for (const [, plane] of clipper.list) {
        plane.visible = nextVisible;
        plane.controls.enabled = nextVisible;
        plane.controls.getHelper().visible = nextVisible;
        plane.helper.visible = nextVisible;
      }
      worldRef.current?.renderer?.updateClippingPlanes();
      worldRef.current?.renderer?.update();
    },
    [setStoreSectionGizmosVisible]
  );

  const lookPerpendicularToFace = useCallback(
    async (point: THREE.Vector3, normal: THREE.Vector3) => {
      const world = worldRef.current;
      if (!world) return;

      orthoZoomTargetRef.current = null;
      const controls = world.camera.controls;
      const camera = world.camera.three;
      const outwardNormal = orientOutwardNormal(normal, point, camera);

      const currentTarget = new THREE.Vector3();
      controls.getTarget(currentTarget);

      const distToHit = camera.position.distanceTo(point);
      const distToTarget = camera.position.distanceTo(currentTarget);
      const distance = Math.max(
        2,
        Number.isFinite(distToHit) && distToHit > 0.25 ? distToHit : distToTarget || 10
      );

      const offset = outwardNormal.clone().multiplyScalar(distance);
      // Avoid polar degeneracy when looking straight down or straight up along Y.
      if (Math.abs(outwardNormal.y) > 0.999) {
        const horizView = new THREE.Vector3(
          currentTarget.x - camera.position.x,
          0,
          currentTarget.z - camera.position.z
        );
        if (horizView.lengthSq() < 1e-8) {
          camera.getWorldDirection(horizView);
          horizView.y = 0;
        }
        const nudge = Math.max(0.001, distance * 0.001);
        if (horizView.lengthSq() >= 1e-8) {
          horizView.normalize().multiplyScalar(-nudge);
          offset.x += horizView.x;
          offset.z += horizView.z;
        } else {
          offset.z += nudge;
        }
      }

      const nextPos = point.clone().add(offset);
      void controls.setFocalOffset(0, 0, 0, true);
      await controls.setLookAt(
        nextPos.x,
        nextPos.y,
        nextPos.z,
        point.x,
        point.y,
        point.z,
        true
      );
      await fragmentsRef.current?.core.update(true);
    },
    []
  );

  const pickSectionPlaneAtClientPoint = useCallback(
    (clientX: number, clientY: number): string | null => {
      const clipper = clipperRef.current;
      const world = worldRef.current;
      const domElement = world?.renderer?.three.domElement;
      if (!clipper || !world || !domElement || clipper.list.size === 0) {
        return null;
      }

      const rect = domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      const targets: THREE.Object3D[] = [];
      const targetToPlaneId = new Map<THREE.Object3D, string>();

      const addTarget = (obj: THREE.Object3D, planeId: string) => {
        if (targetToPlaneId.has(obj)) return;
        targetToPlaneId.set(obj, planeId);
        targets.push(obj);
      };

      const isVisibleBranch = (node: THREE.Object3D, root: THREE.Object3D): boolean => {
        let cur: THREE.Object3D | null = node;
        while (cur) {
          if (!cur.visible) return false;
          if (cur === root) return true;
          cur = cur.parent;
        }
        return true;
      };

      for (const [planeId, plane] of clipper.list) {
        if (!plane.enabled || !plane.visible) continue;

        for (const mesh of plane.meshes) {
          addTarget(mesh, planeId);
        }

        const helperRoot = plane.controls.getHelper();
        const gizmoObj = helperRoot.children[0];
        if (gizmoObj) {
          gizmoObj.traverse((child) => {
            if (child instanceof THREE.Mesh && isVisibleBranch(child, gizmoObj)) {
              addTarget(child, planeId);
            }
          });
        }
      }

      if (targets.length === 0) return null;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, world.camera.three);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length === 0) return null;

      return targetToPlaneId.get(hits[0].object) ?? null;
    },
    []
  );

  const deleteSectionPlane = useCallback(
    (planeId: string) => {
      const clipper = clipperRef.current;
      if (!clipper || !clipper.list.has(planeId)) return;

      clipper.list.delete(planeId);
      if (clipper.list.size === 0) {
        clipper.enabled = false;
        clipper.visible = true;
        setStoreSectionActive(false);
        setStoreSectionGizmosVisible(true);
      } else {
        setStoreSectionActive(true);
      }
      worldRef.current?.renderer?.updateClippingPlanes();
      void fragmentsRef.current?.core.update(true);
      worldRef.current?.renderer?.update();
    },
    [setStoreSectionActive, setStoreSectionGizmosVisible]
  );

  const clearSections = useCallback(() => {
    const clipper = clipperRef.current;
    if (!clipper) return;

    clipper.deleteAll();
    clipper.enabled = false;
    clipper.visible = true;
    worldRef.current?.renderer?.updateClippingPlanes();
    void fragmentsRef.current?.core.update(true);
    setStoreSectionActive(false);
    setStoreSectionGizmosVisible(true);
    if (useViewerStore.getState().activeTool === 'section') {
      setStoreActiveTool('select');
    }
  }, [setStoreActiveTool, setStoreSectionActive, setStoreSectionGizmosVisible]);

  const pickMeasureTargetAtClientPoint = useCallback(
    async (
      clientX: number,
      clientY: number
    ): Promise<MeasureSnapTarget | null> => {
      const components = componentsRef.current;
      const world = worldRef.current;
      const domElement = world?.renderer?.three.domElement;
      if (!components || !world || !domElement) return null;

      const rect = domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;
      const ndc = new THREE.Vector2(
        (mouseX / rect.width) * 2 - 1,
        -(mouseY / rect.height) * 2 + 1
      );
      const camera = world.camera.three;
      const camPos = camera.position;

      const getWorldPerPixel = (worldPoint: THREE.Vector3): number => {
        if (camera instanceof THREE.PerspectiveCamera) {
          const dist = Math.max(0.01, worldPoint.distanceTo(camPos));
          return (
            (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) /
            rect.height
          );
        }
        const ortho = camera as THREE.OrthographicCamera;
        return (
          Math.abs(ortho.top - ortho.bottom) /
          (Math.max(1e-6, ortho.zoom) * rect.height)
        );
      };

      const projectWorldToCanvas = (
        worldPoint: THREE.Vector3
      ): { x: number; y: number } | null => {
        if (camera instanceof THREE.PerspectiveCamera) {
          const viewPt = worldPoint.clone().applyMatrix4(camera.matrixWorldInverse);
          if (viewPt.z >= -camera.near) return null;
        }
        const projected = worldPoint.clone().project(camera);
        if (
          !Number.isFinite(projected.x) ||
          !Number.isFinite(projected.y) ||
          projected.z < -1 ||
          projected.z > 1
        ) {
          return null;
        }
        return {
          x: (projected.x * 0.5 + 0.5) * rect.width,
          y: (-projected.y * 0.5 + 0.5) * rect.height,
        };
      };

      const screenDistPointPx = (worldPoint: THREE.Vector3): number => {
        const px = projectWorldToCanvas(worldPoint);
        if (!px) return Infinity;
        return Math.hypot(mouseX - px.x, mouseY - px.y);
      };

      const screenDistSegmentPx = (
        aWorld: THREE.Vector3,
        bWorld: THREE.Vector3
      ): number => {
        let pA = aWorld.clone();
        let pB = bWorld.clone();

        if (camera instanceof THREE.PerspectiveCamera) {
          const nearPlaneZ = -camera.near * 1.001;
          const vA = pA.clone().applyMatrix4(camera.matrixWorldInverse);
          const vB = pB.clone().applyMatrix4(camera.matrixWorldInverse);
          const inA = vA.z < nearPlaneZ;
          const inB = vB.z < nearPlaneZ;
          if (!inA && !inB) return Infinity;
          if (!inA && inB) {
            const t = (nearPlaneZ - vA.z) / (vB.z - vA.z || 1);
            pA.lerpVectors(pA, pB, THREE.MathUtils.clamp(t, 0, 1));
          } else if (inA && !inB) {
            const t = (nearPlaneZ - vB.z) / (vA.z - vB.z || 1);
            pB.lerpVectors(pB, pA, THREE.MathUtils.clamp(t, 0, 1));
          }
        }

        const sA = pA.project(camera);
        const sB = pB.project(camera);
        const ax = (sA.x * 0.5 + 0.5) * rect.width;
        const ay = (-sA.y * 0.5 + 0.5) * rect.height;
        const bx = (sB.x * 0.5 + 0.5) * rect.width;
        const by = (-sB.y * 0.5 + 0.5) * rect.height;

        const abx = bx - ax;
        const aby = by - ay;
        const abLenSq = abx * abx + aby * aby;
        if (abLenSq <= 1e-6) {
          return Math.hypot(mouseX - ax, mouseY - ay);
        }
        const t = THREE.MathUtils.clamp(
          ((mouseX - ax) * abx + (mouseY - ay) * aby) / abLenSq,
          0,
          1
        );
        return Math.hypot(mouseX - (ax + t * abx), mouseY - (ay + t * aby));
      };

      const closestPointOnSegment = (
        target: THREE.Vector3,
        a: THREE.Vector3,
        b: THREE.Vector3
      ): THREE.Vector3 => {
        const seg = new THREE.Vector3().subVectors(b, a);
        const lenSq = seg.lengthSq();
        if (lenSq <= 1e-12) return a.clone();
        const t = THREE.MathUtils.clamp(
          new THREE.Vector3().subVectors(target, a).dot(seg) / lenSq,
          0,
          1
        );
        return a.clone().addScaledVector(seg, t);
      };

      const raycaster = components.get(OBC.Raycasters).get(world);
      const fastPicker = components.get(OBC.FastModelPickers).get(world);
      const fragPick = await fastPicker.getFullPick(ndc).catch(() => null);

      let meshPick: THREE.Intersection | null = null;
      if (world.meshes.size > 0) {
        meshPick = raycaster.castRayToObjects(Array.from(world.meshes), ndc);
      }

      const useFragPick =
        fragPick !== null &&
        (!meshPick ||
          camPos.distanceToSquared(fragPick.point) <=
          camPos.distanceToSquared(meshPick.point) + 1e-4);

      if (useFragPick && fragPick) {
        const worldPerPx = getWorldPerPixel(fragPick.point);
        const vertexWindow = THREE.MathUtils.clamp(worldPerPx * 28, 0.003, 5.0);
        const edgeWindow = THREE.MathUtils.clamp(worldPerPx * 22, 0.002, 4.0);
        const faceWindow = Math.max(worldPerPx * 40, 0.5);

        const snapResolver = components.get(OBC.SnapResolvers).get();
        const prevMaxDist = snapResolver.maxDistance;
        try {
          snapResolver.maxDistance = vertexWindow;
          const pointRes = await snapResolver
            .resolve(fragPick.point, fragPick.modelId, fragPick.itemId, [
              OBC.SnapClass.POINT,
            ])
            .catch(() => null);

          if (
            pointRes &&
            pointRes.snappingClass === OBC.SnapClass.POINT &&
            screenDistPointPx(pointRes.point) <= 13
          ) {
            return {
              kind: 'point',
              point: pointRes.point.clone(),
              modelId: fragPick.modelId,
            };
          }

          snapResolver.maxDistance = edgeWindow;
          const lineRes = await snapResolver
            .resolve(fragPick.point, fragPick.modelId, fragPick.itemId, [
              OBC.SnapClass.LINE,
            ])
            .catch(() => null);

          if (
            lineRes &&
            lineRes.snappingClass === OBC.SnapClass.LINE &&
            lineRes.snappedEdgeP1 &&
            lineRes.snappedEdgeP2 &&
            screenDistSegmentPx(lineRes.snappedEdgeP1, lineRes.snappedEdgeP2) <= 9
          ) {
            return {
              kind: 'line',
              point: lineRes.point.clone(),
              edgeStart: lineRes.snappedEdgeP1.clone(),
              edgeEnd: lineRes.snappedEdgeP2.clone(),
              normal: lineRes.normal
                ? orientOutwardNormal(lineRes.normal, lineRes.point, camera)
                : undefined,
              modelId: fragPick.modelId,
            };
          }

          let faceRes =
            pointRes?.snappingClass === OBC.SnapClass.FACE
              ? pointRes
              : lineRes?.snappingClass === OBC.SnapClass.FACE
                ? lineRes
                : null;

          if (!faceRes) {
            snapResolver.maxDistance = faceWindow;
            faceRes = await snapResolver
              .resolve(fragPick.point, fragPick.modelId, fragPick.itemId, [
                OBC.SnapClass.FACE,
              ])
              .catch(() => null);
          }

          if (faceRes && faceRes.normal && faceRes.normal.lengthSq() > 1e-6) {
            return {
              kind: 'face',
              point: faceRes.point.clone(),
              normal: orientOutwardNormal(faceRes.normal, faceRes.point, camera),
              facePoints: faceRes.facePoints,
              modelId: fragPick.modelId,
            };
          }
        } finally {
          snapResolver.maxDistance = prevMaxDist;
        }
      }

      // Triangle-mesh fallback (for triangulated terrains, road pavements, or non-shell Three meshes)
      if (meshPick?.face && meshPick.object instanceof THREE.Mesh) {
        const mesh = meshPick.object;
        const posAttr = mesh.geometry?.getAttribute?.('position');
        if (posAttr) {
          const matrix = mesh.matrixWorld.clone();
          if (mesh instanceof THREE.InstancedMesh && meshPick.instanceId !== undefined) {
            const instMat = new THREE.Matrix4();
            mesh.getMatrixAt(meshPick.instanceId, instMat);
            matrix.multiply(instMat);
          }

          const v0 = new THREE.Vector3()
            .fromBufferAttribute(posAttr, meshPick.face.a)
            .applyMatrix4(matrix);
          const v1 = new THREE.Vector3()
            .fromBufferAttribute(posAttr, meshPick.face.b)
            .applyMatrix4(matrix);
          const v2 = new THREE.Vector3()
            .fromBufferAttribute(posAttr, meshPick.face.c)
            .applyMatrix4(matrix);

          const triVerts = [v0, v1, v2];
          let bestVert: THREE.Vector3 | null = null;
          let bestVertPx = 13;
          for (const v of triVerts) {
            const pxDist = screenDistPointPx(v);
            if (pxDist <= bestVertPx) {
              bestVertPx = pxDist;
              bestVert = v;
            }
          }
          if (bestVert) {
            return { kind: 'point', point: bestVert.clone() };
          }

          const triEdges: [THREE.Vector3, THREE.Vector3][] = [
            [v0, v1],
            [v1, v2],
            [v2, v0],
          ];
          let bestEdge: [THREE.Vector3, THREE.Vector3] | null = null;
          let bestEdgePx = 9;
          for (const edge of triEdges) {
            const pxDist = screenDistSegmentPx(edge[0], edge[1]);
            if (pxDist <= bestEdgePx) {
              bestEdgePx = pxDist;
              bestEdge = edge;
            }
          }
          if (bestEdge) {
            return {
              kind: 'line',
              point: closestPointOnSegment(meshPick.point, bestEdge[0], bestEdge[1]),
              edgeStart: bestEdge[0].clone(),
              edgeEnd: bestEdge[1].clone(),
            };
          }

          const normal = getMeshWorldNormal(
            meshPick.object,
            meshPick.face.normal,
            meshPick.instanceId
          );
          return {
            kind: 'face',
            point: meshPick.point.clone(),
            normal: orientOutwardNormal(normal, meshPick.point, camera),
            facePoints: new Float32Array([
              v0.x,
              v0.y,
              v0.z,
              v1.x,
              v1.y,
              v1.z,
              v2.x,
              v2.y,
              v2.z,
            ]),
          };
        }
      }

      if (fragPick?.point && fragPick.normal && fragPick.normal.lengthSq() > 1e-6) {
        return {
          kind: 'face',
          point: fragPick.point.clone(),
          normal: orientOutwardNormal(fragPick.normal, fragPick.point, camera),
          modelId: fragPick.modelId,
        };
      }

      return null;
    },
    []
  );

  const updateMeasureOverlay = useCallback(
    (
      state: {
        hover?: MeasureSnapTarget | null;
        anchor?: MeasureSnapTarget | null;
        preview?: ComputedMeasurement | null;
      } | null
    ) => {
      const overlay = measureOverlayRef.current;
      const world = worldRef.current;
      const domElement = world?.renderer?.three.domElement;
      if (!overlay || !world) return;

      const setEdgeLine = (
        lineObj: Line2,
        target: MeasureSnapTarget | null | undefined
      ) => {
        if (target?.kind === 'line' && target.edgeStart && target.edgeEnd) {
          lineObj.geometry.setPositions([
            target.edgeStart.x,
            target.edgeStart.y,
            target.edgeStart.z,
            target.edgeEnd.x,
            target.edgeEnd.y,
            target.edgeEnd.z,
          ]);
          lineObj.geometry.computeBoundingSphere();
          lineObj.computeLineDistances();
          lineObj.visible = true;
        } else {
          lineObj.visible = false;
        }
      };

      const applyFacePolygonHighlight = (
        fillMesh: THREE.Mesh,
        outlineLine: Line2,
        target: MeasureSnapTarget | null | undefined
      ): boolean => {
        if (
          target?.kind !== 'face' ||
          !target.facePoints ||
          target.facePoints.length < 9
        ) {
          fillMesh.visible = false;
          outlineLine.visible = false;
          return false;
        }

        const { flatIndices, loopPositions } = triangulatePlanarFace(
          target.facePoints,
          target.normal
        );
        if (flatIndices.length === 0) {
          fillMesh.visible = false;
          outlineLine.visible = false;
          return false;
        }

        fillMesh.geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(new Float32Array(target.facePoints), 3)
        );
        fillMesh.geometry.setIndex(flatIndices);
        fillMesh.geometry.computeBoundingSphere();
        fillMesh.visible = true;

        outlineLine.geometry.setPositions(loopPositions);
        outlineLine.geometry.computeBoundingSphere();
        outlineLine.computeLineDistances();
        outlineLine.visible = true;
        return true;
      };

      const hover = state?.hover ?? null;
      const anchor = state?.anchor ?? null;
      const preview = state?.preview ?? null;

      setEdgeLine(overlay.hoverEdgeLine, hover);
      setEdgeLine(overlay.anchorEdgeLine, anchor);
      applyFacePolygonHighlight(
        overlay.anchorFaceFill,
        overlay.anchorFaceOutline,
        anchor
      );

      const hasHoverPolygon = applyFacePolygonHighlight(
        overlay.hoverFaceFill,
        overlay.hoverFaceOutline,
        hover
      );

      // Fallback plane disk only when the face polygon points aren't available
      if (hover?.kind === 'face' && hover.normal && !hasHoverPolygon) {
        const camera = world.camera.three;
        const heightPx = domElement?.getBoundingClientRect().height || 800;
        let worldPerPx = 0.01;
        if (camera instanceof THREE.PerspectiveCamera) {
          const dist = Math.max(0.01, hover.point.distanceTo(camera.position));
          worldPerPx =
            (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) /
            Math.max(1, heightPx);
        } else {
          const ortho = camera as THREE.OrthographicCamera;
          worldPerPx =
            Math.abs(ortho.top - ortho.bottom) /
            (Math.max(1e-6, ortho.zoom) * Math.max(1, heightPx));
        }

        const radius = THREE.MathUtils.clamp(worldPerPx * 28, 0.02, 3.0);
        const unitN = hover.normal.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          unitN
        );
        const diskPos = hover.point.clone().addScaledVector(unitN, Math.min(0.01, radius * 0.03));

        overlay.hoverFaceDisk.position.copy(diskPos);
        overlay.hoverFaceDisk.quaternion.copy(quat);
        overlay.hoverFaceDisk.scale.setScalar(radius);
        overlay.hoverFaceDisk.visible = true;

        overlay.hoverFaceRing.position.copy(diskPos);
        overlay.hoverFaceRing.quaternion.copy(quat);
        overlay.hoverFaceRing.scale.setScalar(radius);
        overlay.hoverFaceRing.visible = true;
      } else {
        overlay.hoverFaceDisk.visible = false;
        overlay.hoverFaceRing.visible = false;
      }

      if (preview) {
        overlay.previewDim.start = preview.start.clone();
        overlay.previewDim.end = preview.end.clone();
        overlay.previewDim.visible = true;

        if (preview.guides.length > 0) {
          const guidePoints: THREE.Vector3[] = [];
          for (const g of preview.guides) {
            guidePoints.push(g.start.clone(), g.end.clone());
          }
          overlay.previewGuides.geometry.setFromPoints(guidePoints);
          overlay.previewGuides.computeLineDistances();
          overlay.previewGuides.visible = true;
        } else {
          overlay.previewGuides.visible = false;
        }
      } else {
        overlay.previewDim.visible = false;
        overlay.previewGuides.visible = false;
      }

      world.renderer?.update();
    },
    []
  );

  const commitMeasurement = useCallback((measurement: ComputedMeasurement) => {
    const lengthMeasurement = lengthMeasurementRef.current;
    const overlay = measureOverlayRef.current;
    if (!lengthMeasurement) return;

    const line = new OBCF.Line(
      measurement.start.clone(),
      measurement.end.clone()
    );
    lengthMeasurement.list.add(line);

    if (overlay) {
      overlay.committedLines.push(line);
      if (measurement.guides.length > 0) {
        const pts: THREE.Vector3[] = [];
        for (const g of measurement.guides) {
          pts.push(g.start.clone(), g.end.clone());
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const seg = new THREE.LineSegments(geo, overlay.permanentGuidesMat);
        seg.computeLineDistances();
        seg.frustumCulled = false;
        seg.renderOrder = 52;
        overlay.permanentGuidesGroup.add(seg);
        overlay.permanentGuidesByLine.set(line, seg);
      }
    }

    worldRef.current?.renderer?.update();
  }, []);

  const removeLastMeasurement = useCallback(() => {
    const lengthMeasurement = lengthMeasurementRef.current;
    const overlay = measureOverlayRef.current;
    if (!lengthMeasurement || lengthMeasurement.list.size === 0) return;

    let targetLine: OBCF.Line | undefined;
    if (overlay && overlay.committedLines.length > 0) {
      targetLine = overlay.committedLines.pop();
    } else {
      for (const item of lengthMeasurement.list) {
        targetLine = item;
      }
    }
    if (!targetLine) return;

    const guideSeg = overlay?.permanentGuidesByLine.get(targetLine);
    if (guideSeg && overlay) {
      overlay.permanentGuidesGroup.remove(guideSeg);
      guideSeg.geometry.dispose();
      overlay.permanentGuidesByLine.delete(targetLine);
    }

    lengthMeasurement.list.delete(targetLine);
    worldRef.current?.renderer?.update();
  }, []);

  const clearMeasurements = useCallback(() => {
    const overlay = measureOverlayRef.current;
    if (overlay) {
      for (const seg of overlay.permanentGuidesByLine.values()) {
        overlay.permanentGuidesGroup.remove(seg);
        seg.geometry.dispose();
      }
      overlay.permanentGuidesByLine.clear();
      overlay.committedLines.length = 0;
      overlay.hoverAreaFill.visible = false;
      overlay.hoverAreaOutline.visible = false;
      clearDynamicMeasureGroup(
        overlay.areaGroup,
        overlay.areaDisposables
      );
      for (const badge of overlay.areaBadgeMap.values()) {
        badge.labelObj.element.remove();
        badge.labelObj.removeFromParent();
      }
      overlay.areaBadgeMap.clear();

      for (const badge of overlay.volumeBadgeMap.values()) {
        badge.labelObj.element.remove();
        badge.labelObj.removeFromParent();
      }
      overlay.volumeBadgeMap.clear();
      overlay.volumeGroup.clear();

      overlay.previewDim.visible = false;
      overlay.previewGuides.visible = false;
      overlay.hoverEdgeLine.visible = false;
      overlay.anchorEdgeLine.visible = false;
      overlay.hoverFaceFill.visible = false;
      overlay.hoverFaceOutline.visible = false;
      overlay.anchorFaceFill.visible = false;
      overlay.anchorFaceOutline.visible = false;
      overlay.hoverFaceDisk.visible = false;
      overlay.hoverFaceRing.visible = false;
    }
    if (lengthMeasurementRef.current) {
      lengthMeasurementRef.current.list.clear();
    }
    if (highlighterRef.current) {
      void highlighterRef.current.clear('measure-volume');
      void highlighterRef.current.clear('measure-volume-hover');
    }
    lastVolumeHoverKeyRef.current = null;
    worldRef.current?.renderer?.update();
  }, []);

  const prevProjectIdRef = useRef<string | null>(currentProjectId);

  // Synchronize 3D engine model visibility & reset tools/overlays when project changes
  useEffect(() => {
    if (!isEngineReady || !worldRef.current) {
      prevProjectIdRef.current = currentProjectId;
      return;
    }

    if (prevProjectIdRef.current === currentProjectId) {
      return;
    }

    prevProjectIdRef.current = currentProjectId;

    const syncEngineToProject = async () => {
      const fragments = fragmentsRef.current;
      const world = worldRef.current;
      const components = componentsRef.current;
      if (!fragments || !world) return;

      // 1. Clear highlighters
      if (highlighterRef.current) {
        await highlighterRef.current.clear('select').catch(() => { });
        await highlighterRef.current.clear('measure-volume').catch(() => { });
        await highlighterRef.current.clear('measure-volume-hover').catch(() => { });
      }

      // 2. Clear clipper planes
      if (clipperRef.current) {
        clipperRef.current.deleteAll();
        clipperRef.current.enabled = false;
        clipperRef.current.visible = true;
        setStoreSectionActive(false);
        setStoreSectionGizmosVisible(true);
      }

      // 3. Reset hider
      if (components) {
        try {
          const hider = components.get(OBC.Hider);
          await hider.set(true);
        } catch {
          // ignore
        }
      }

      // 4. Clear measurements & overlays
      clearMeasurements();

      // 5. Update visibility of each loaded model in Three.js
      const loadedModels = useViewerStore.getState().loadedModels;
      let hasVisibilityChange = false;

      for (const info of loadedModels) {
        const fragModel = fragments.list.get(info.id);
        if (!fragModel) continue;

        if (info.projectId) {
          const belongsToCurrent = info.projectId === currentProjectId;
          const targetVisible = belongsToCurrent
            ? (info.userVisible ?? true)
            : false;
          if (fragModel.object.visible !== targetVisible) {
            setModelHierarchyVisibility(fragModel, targetVisible);
            hasVisibilityChange = true;
          }
        }
      }

      if (hasVisibilityChange) {
        await fragments.core.update(true);
      }

      // 6. Camera fit to visible models of the newly active project (if any)
      try {
        const combinedBox = getVisibleModelsBounds(fragments);
        if (combinedBox && !combinedBox.isEmpty()) {
          const size = combinedBox.getSize(new THREE.Vector3());
          const maxExtent = Math.max(size.x, size.y, size.z);
          if (Number.isFinite(maxExtent) && maxExtent > 0) {
            const dynamicFar = Math.max(2500, maxExtent * 10);
            world.camera.threePersp.far = dynamicFar;
            world.camera.threePersp.updateProjectionMatrix();
            world.camera.threeOrtho.far = dynamicFar;
            world.camera.threeOrtho.updateProjectionMatrix();
          }
          await world.camera.controls.fitToBox(combinedBox, true, {
            paddingLeft: 2,
            paddingRight: 2,
            paddingBottom: 2,
            paddingTop: 2,
          });
          await fragments.core.update(true);
        } else {
          await world.camera.controls.setLookAt(15, 12, 15, 0, 0, 0, true);
        }
      } catch (err) {
        console.warn(
          '[EngineContext] Project switch camera adjustment warning:',
          err,
        );
      }

      world.renderer?.update();
    };

    void syncEngineToProject();
  }, [
    clearMeasurements,
    currentProjectId,
    isEngineReady,
    setStoreSectionActive,
    setStoreSectionGizmosVisible,
  ]);

  const pickAreaFaceAtClientPoint = useCallback(
    async (clientX: number, clientY: number): Promise<AreaFaceMeasurement | null> => {
      const components = componentsRef.current;
      const world = worldRef.current;
      const fragments = fragmentsRef.current;
      const domElement = world?.renderer?.three.domElement;
      if (!components || !world || !domElement) return null;

      const rect = domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const camera = world.camera.three;
      const camPos = camera.position;

      const raycaster = components.get(OBC.Raycasters).get(world);
      const fastPicker = components.get(OBC.FastModelPickers).get(world);
      const fragPick = await fastPicker.getFullPick(ndc).catch(() => null);

      let meshPick: THREE.Intersection | null = null;
      if (world.meshes.size > 0) {
        meshPick = raycaster.castRayToObjects(Array.from(world.meshes), ndc);
      }

      const useFragPick =
        fragPick !== null &&
        (!meshPick ||
          camPos.distanceToSquared(fragPick.point) <=
          camPos.distanceToSquared(meshPick.point) + 1e-4);

      const buildFaceKey = (
        modelId: string | undefined,
        localId: number | undefined,
        unitN: THREE.Vector3,
        anchor: THREE.Vector3,
        area: number
      ) =>
        `${modelId ?? 'mesh'}:${localId ?? 0}:${Math.round(unitN.x * 100)}_${Math.round(unitN.y * 100)}_${Math.round(unitN.z * 100)}:${Math.round(unitN.dot(anchor) * 100)}:${Math.round(anchor.x * 50)}_${Math.round(anchor.y * 50)}_${Math.round(anchor.z * 50)}:${Math.round(area * 1000)}`;

      if (useFragPick && fragPick) {
        const snapResolver = components.get(OBC.SnapResolvers).get();
        const prevMaxDist = snapResolver.maxDistance;
        const worldPerPx =
          camera instanceof THREE.PerspectiveCamera
            ? (2 *
              Math.max(0.01, fragPick.point.distanceTo(camPos)) *
              Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) /
            rect.height
            : Math.abs(
              (camera as THREE.OrthographicCamera).top -
              (camera as THREE.OrthographicCamera).bottom
            ) /
            (Math.max(1e-6, (camera as THREE.OrthographicCamera).zoom) * rect.height);
        snapResolver.maxDistance = Math.max(worldPerPx * 40, 0.5);
        let faceRes = null;
        try {
          faceRes = await snapResolver
            .resolve(fragPick.point, fragPick.modelId, fragPick.itemId, [
              OBC.SnapClass.FACE,
            ])
            .catch(() => null);
        } finally {
          snapResolver.maxDistance = prevMaxDist;
        }

        const rawNormal = faceRes?.normal ?? fragPick.normal;
        if (!rawNormal || rawNormal.lengthSq() <= 1e-6) return null;
        const unitN = orientOutwardNormal(rawNormal, fragPick.point, camera);

        if (faceRes?.facePoints && faceRes.facePoints.length >= 9) {
          const facePoints = new Float32Array(faceRes.facePoints);
          const { area, labelPoint, centroid } = computePlanarFaceAreaAndLabelPoint(
            facePoints,
            unitN,
            fragPick.point
          );
          if (area <= 1e-8) return null;

          return {
            key: buildFaceKey(
              fragPick.modelId,
              fragPick.localId,
              unitN,
              centroid,
              area
            ),
            area,
            labelPoint,
            normal: unitN,
            facePoints,
            modelId: fragPick.modelId,
            localId: fragPick.localId,
          };
        }

        // Fallback to flood-filling coplanar triangles from item geometry
        const model = fragments?.list.get(fragPick.modelId);
        if (model && typeof fragPick.localId === 'number') {
          const geoms = await model.getItemsGeometry([fragPick.localId]).catch(() => null);
          const itemMeshes = geoms?.[0] ?? [];
          const region = collectCoplanarFragmentFaceArea(
            itemMeshes,
            fragPick.point,
            unitN,
            model.object.matrixWorld
          );
          if (region && region.area > 1e-8) {
            return {
              key: buildFaceKey(
                fragPick.modelId,
                fragPick.localId,
                unitN,
                region.labelPoint,
                region.area
              ),
              area: region.area,
              labelPoint: region.labelPoint,
              normal: unitN,
              facePoints: region.positions,
              triIndices: region.triIndices,
              modelId: fragPick.modelId,
              localId: fragPick.localId,
            };
          }
        }
      }

      if (
        meshPick?.face &&
        meshPick.faceIndex !== undefined &&
        meshPick.faceIndex !== null &&
        meshPick.object instanceof THREE.Mesh
      ) {
        const unitN = orientOutwardNormal(
          getMeshWorldNormal(meshPick.object, meshPick.face.normal, meshPick.instanceId),
          meshPick.point,
          camera
        );
        const region = collectCoplanarMeshRegion(
          meshPick.object,
          meshPick.faceIndex,
          meshPick.point,
          unitN,
          meshPick.instanceId
        );
        if (region && region.area > 1e-8) {
          return {
            key: buildFaceKey(undefined, undefined, unitN, region.labelPoint, region.area),
            area: region.area,
            labelPoint: region.labelPoint,
            normal: unitN,
            facePoints: region.positions,
            triIndices: region.triIndices,
          };
        }
      }

      return null;
    },
    []
  );

  const updateAreaSelectedOverlay = useCallback(
    (items: AreaFaceMeasurement[]) => {
      const overlay = measureOverlayRef.current;
      const world = worldRef.current;
      if (!overlay || !world) return;

      for (const item of overlay.areaDisposables) {
        item.dispose();
      }
      overlay.areaDisposables.length = 0;
      overlay.areaGroup.clear();

      const rendererSize = world.renderer?.getSize() ?? new THREE.Vector2(1, 1);

      for (const face of items) {
        const indices = face.triIndices
          ? face.triIndices
          : triangulatePlanarFace(face.facePoints, face.normal).flatIndices;
        if (indices.length === 0) continue;

        const offsetPos = new Float32Array(face.facePoints.length);
        const nx = face.normal.x * 0.003;
        const ny = face.normal.y * 0.003;
        const nz = face.normal.z * 0.003;
        for (let i = 0; i < face.facePoints.length; i += 3) {
          offsetPos[i] = face.facePoints[i] + nx;
          offsetPos[i + 1] = face.facePoints[i + 1] + ny;
          offsetPos[i + 2] = face.facePoints[i + 2] + nz;
        }

        const fillGeo = new THREE.BufferGeometry();
        fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(offsetPos, 3));
        fillGeo.setIndex(indices);
        fillGeo.computeBoundingSphere();

        const fillMat = new THREE.MeshBasicMaterial({
          color: 0x10b981,
          side: THREE.DoubleSide,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          transparent: true,
          opacity: 0.34,
        });
        const fillMesh = new THREE.Mesh(fillGeo, fillMat);
        fillMesh.frustumCulled = false;
        fillMesh.renderOrder = 48;
        overlay.areaGroup.add(fillMesh);
        overlay.areaDisposables.push(fillGeo, fillMat);

        if (!face.triIndices) {
          const { loopPositions } = triangulatePlanarFace(offsetPos, face.normal);
          if (loopPositions.length >= 6) {
            const lineGeo = new LineGeometry();
            lineGeo.setPositions(loopPositions);
            const lineMat = new LineMaterial({
              color: 0x34d399,
              linewidth: 3,
              worldUnits: false,
              depthTest: true,
              transparent: true,
              opacity: 0.96,
              resolution: new THREE.Vector2(rendererSize.x || 1, rendererSize.y || 1),
            });
            const lineObj = new Line2(lineGeo, lineMat);
            lineObj.frustumCulled = false;
            lineObj.renderOrder = 49;
            overlay.areaGroup.add(lineObj);
            overlay.areaDisposables.push(lineGeo, lineMat);
          }
        }
      }

      // Re-attach persistent badges into areaGroup and sync text in place without unmounting
      const currentKeys = new Set(items.map((it) => it.key));
      for (const [key, badge] of overlay.areaBadgeMap.entries()) {
        if (!currentKeys.has(key)) {
          badge.labelObj.element.remove();
          badge.labelObj.removeFromParent();
          overlay.areaBadgeMap.delete(key);
        }
      }

      const totalArea = items.reduce((sum, item) => sum + item.area, 0);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isLatest = i === items.length - 1;
        const primaryText =
          items.length > 1 && isLatest
            ? `Total (${items.length}): ${formatDecimalEs(totalArea, 3)} m²`
            : items.length > 1
              ? `+${formatDecimalEs(item.area, 3)} m²`
              : `${formatDecimalEs(item.area, 3)} m²`;
        const secondaryText =
          items.length > 1 && isLatest
            ? `Cara: +${formatDecimalEs(item.area, 3)} m²`
            : undefined;

        let badge = overlay.areaBadgeMap.get(item.key);
        if (badge) {
          syncMeasureBadgeEntry(badge, primaryText, '#34d399', secondaryText);
          badge.labelObj.position.copy(item.labelPoint);
          if (badge.labelObj.parent !== overlay.areaGroup) {
            overlay.areaGroup.add(badge.labelObj);
          }
        } else {
          badge = createMeasureBadgeEntry(item.key, primaryText, '#34d399', secondaryText);
          badge.labelObj.position.copy(item.labelPoint);
          overlay.areaGroup.add(badge.labelObj);
          overlay.areaBadgeMap.set(item.key, badge);
        }
      }

      world.renderer?.update();
    },
    []
  );

  const updateAreaHoverOverlay = useCallback(
    (hover: AreaFaceMeasurement | null) => {
      const overlay = measureOverlayRef.current;
      const world = worldRef.current;
      if (!overlay || !world) return;

      if (
        hover &&
        hover.facePoints &&
        hover.facePoints.length >= 9 &&
        !overlay.areaBadgeMap.has(hover.key)
      ) {
        const { flatIndices, loopPositions } = triangulatePlanarFace(
          hover.facePoints,
          hover.normal
        );
        if (flatIndices.length > 0) {
          overlay.hoverAreaFill.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(new Float32Array(hover.facePoints), 3)
          );
          overlay.hoverAreaFill.geometry.setIndex(flatIndices);
          overlay.hoverAreaFill.geometry.computeBoundingSphere();
          overlay.hoverAreaFill.visible = true;

          if (loopPositions.length >= 6) {
            overlay.hoverAreaOutline.geometry.setPositions(loopPositions);
            overlay.hoverAreaOutline.geometry.computeBoundingSphere();
            overlay.hoverAreaOutline.computeLineDistances();
            overlay.hoverAreaOutline.visible = true;
          } else {
            overlay.hoverAreaOutline.visible = false;
          }
        } else {
          overlay.hoverAreaFill.visible = false;
          overlay.hoverAreaOutline.visible = false;
        }
      } else {
        overlay.hoverAreaFill.visible = false;
        overlay.hoverAreaOutline.visible = false;
      }

      world.renderer?.update();
    },
    []
  );

  const updateAreaMeasureOverlay = useCallback(
    (items: AreaFaceMeasurement[], hover: AreaFaceMeasurement | null = null) => {
      updateAreaSelectedOverlay(items);
      updateAreaHoverOverlay(hover);
    },
    [updateAreaSelectedOverlay, updateAreaHoverOverlay]
  );

  const pickVolumeElementAtClientPoint = useCallback(
    async (
      clientX: number,
      clientY: number,
      options?: { hoverOnly?: boolean }
    ): Promise<VolumeElementMeasurement | null> => {
      const components = componentsRef.current;
      const world = worldRef.current;
      const fragments = fragmentsRef.current;
      const domElement = world?.renderer?.three.domElement;
      if (!components || !world || !fragments || !domElement) return null;

      const rect = domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      const fastPicker = components.get(OBC.FastModelPickers).get(world);
      const fragPick = await fastPicker.getFullPick(ndc).catch(() => null);
      if (!fragPick || !fragPick.modelId || typeof fragPick.localId !== 'number') {
        return null;
      }

      const key = `${fragPick.modelId}:${fragPick.localId}`;
      const cached = volumeMetricCacheRef.current.get(key);
      if (cached) {
        return {
          key,
          volume: cached.volume,
          center: cached.center.clone(),
          modelId: fragPick.modelId,
          localId: fragPick.localId,
        };
      }

      if (options?.hoverOnly) {
        return {
          key,
          volume: 0,
          center: fragPick.point.clone(),
          modelId: fragPick.modelId,
          localId: fragPick.localId,
        };
      }

      const model = fragments.list.get(fragPick.modelId);
      if (!model) return null;

      let center = fragPick.point.clone();
      try {
        const boxes = await model.getBoxes([fragPick.localId]);
        if (boxes[0] && !boxes[0].isEmpty()) {
          boxes[0].getCenter(center);
        }
      } catch {
        // Fallback to hit point
      }

      let volume = 0;
      try {
        const geoms = await model.getItemsGeometry([fragPick.localId]);
        const meshMetrics = computeMeshMetrics(geoms[0] || []);
        if (meshMetrics && Number.isFinite(meshMetrics.geomVolume) && meshMetrics.geomVolume > 0) {
          volume = meshMetrics.geomVolume;
        }
      } catch {
        // Fallback below
      }

      if (volume <= 0) {
        try {
          const itemVol = await model.getItemsVolume([fragPick.localId]);
          if (typeof itemVol === 'number' && Number.isFinite(itemVol)) {
            volume = Math.abs(itemVol);
          }
        } catch {
          // Ignore volume errors
        }
      }

      volumeMetricCacheRef.current.set(key, {
        volume,
        center: center.clone(),
      });

      return {
        key,
        volume,
        center,
        modelId: fragPick.modelId,
        localId: fragPick.localId,
      };
    },
    []
  );

  const lastVolumeHoverKeyRef = useRef<string | null>(null);
  const volumeHoverReqIdRef = useRef<number>(0);

  const updateVolumeSelectedOverlay = useCallback(
    async (items: VolumeElementMeasurement[]) => {
      const overlay = measureOverlayRef.current;
      const highlighter = highlighterRef.current;
      const world = worldRef.current;
      if (!overlay || !world) return;

      const currentKeys = new Set(items.map((it) => it.key));
      for (const [key, badge] of overlay.volumeBadgeMap.entries()) {
        if (!currentKeys.has(key)) {
          badge.labelObj.element.remove();
          badge.labelObj.removeFromParent();
          overlay.volumeBadgeMap.delete(key);
        }
      }

      const totalVolume = items.reduce((sum, item) => sum + item.volume, 0);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isLatest = i === items.length - 1;
        const primaryText =
          items.length > 1 && isLatest
            ? `Total (${items.length}): ${formatDecimalEs(totalVolume, 3)} m³`
            : items.length > 1
              ? `+${formatDecimalEs(item.volume, 3)} m³`
              : `${formatDecimalEs(item.volume, 3)} m³`;
        const secondaryText =
          items.length > 1 && isLatest
            ? `Elemento: +${formatDecimalEs(item.volume, 3)} m³`
            : undefined;

        let badge = overlay.volumeBadgeMap.get(item.key);
        if (badge) {
          syncMeasureBadgeEntry(badge, primaryText, '#34d399', secondaryText);
          badge.labelObj.position.copy(item.center);
          if (badge.labelObj.parent !== overlay.volumeGroup) {
            overlay.volumeGroup.add(badge.labelObj);
          }
        } else {
          badge = createMeasureBadgeEntry(item.key, primaryText, '#34d399', secondaryText);
          badge.labelObj.position.copy(item.center);
          overlay.volumeGroup.add(badge.labelObj);
          overlay.volumeBadgeMap.set(item.key, badge);
        }
      }

      const selectedMap: OBC.ModelIdMap = {};
      for (const item of items) {
        if (!selectedMap[item.modelId]) {
          selectedMap[item.modelId] = new Set<number>();
        }
        selectedMap[item.modelId].add(item.localId);
      }

      if (highlighter) {
        if (Object.keys(selectedMap).length > 0) {
          await highlighter.highlightByID('measure-volume', selectedMap, true, false);
        } else {
          await highlighter.clear('measure-volume');
        }
      }

      world.renderer?.update();
    },
    []
  );

  const updateVolumeHoverOverlay = useCallback(
    async (hover: VolumeElementMeasurement | null) => {
      const overlay = measureOverlayRef.current;
      const highlighter = highlighterRef.current;
      const world = worldRef.current;
      if (!overlay || !highlighter || !world) return;

      const hoverKey = hover?.key ?? null;
      if (hoverKey === lastVolumeHoverKeyRef.current) return;
      lastVolumeHoverKeyRef.current = hoverKey;

      const reqId = ++volumeHoverReqIdRef.current;

      if (hover && !overlay.volumeBadgeMap.has(hover.key)) {
        await highlighter.highlightByID(
          'measure-volume-hover',
          { [hover.modelId]: new Set([hover.localId]) },
          true,
          false
        );
      } else {
        await highlighter.clear('measure-volume-hover');
      }

      if (reqId === volumeHoverReqIdRef.current) {
        world.renderer?.update();
      }
    },
    []
  );

  const updateVolumeMeasureOverlay = useCallback(
    async (
      items: VolumeElementMeasurement[],
      hover: VolumeElementMeasurement | null = null
    ) => {
      await updateVolumeSelectedOverlay(items);
      await updateVolumeHoverOverlay(hover);
    },
    [updateVolumeSelectedOverlay, updateVolumeHoverOverlay]
  );

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
        focusElements,
        focusSelectionMap,
        toggleSelectionMap,
        clearSelection,
        hideSelectedElements,
        toggleHideSelectedElements,
        isolateSelectedElements,
        showAllElements,
        captureSnapshotBlob,
        getCameraViewpoint,
        setCameraViewpoint,
        toggleGridVisibility,
        toggleSectionBox,
        pickFaceAtClientPoint,
        pickCoordinateAtClientPoint,
        createSectionFromFace,
        lookPerpendicularToFace,
        toggleSectionGizmosVisibility,
        pickSectionPlaneAtClientPoint,
        deleteSectionPlane,
        clearSections,
        measurementCount,
        pickMeasureTargetAtClientPoint,
        updateMeasureOverlay,
        commitMeasurement,
        removeLastMeasurement,
        clearMeasurements,
        pickAreaFaceAtClientPoint,
        updateAreaSelectedOverlay,
        updateAreaHoverOverlay,
        updateAreaMeasureOverlay,
        pickVolumeElementAtClientPoint,
        updateVolumeSelectedOverlay,
        updateVolumeHoverOverlay,
        updateVolumeMeasureOverlay,
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
