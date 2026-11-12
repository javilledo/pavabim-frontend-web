import type * as FRAGS from '@thatopen/fragments';
import * as THREE from 'three';

export type SnapTargetKind = 'point' | 'line' | 'face';

export interface MeasureSnapTarget {
  kind: SnapTargetKind;
  point: THREE.Vector3;
  normal?: THREE.Vector3;
  edgeStart?: THREE.Vector3;
  edgeEnd?: THREE.Vector3;
  facePoints?: Float32Array | Float64Array;
  modelId?: string;
}

export interface MeasureGuideSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
}

export type MeasurePairKind =
  | 'point-point'
  | 'point-edge'
  | 'edge-edge'
  | 'edge-plane'
  | 'plane-plane'
  | 'point-plane';

export interface ComputedMeasurement {
  start: THREE.Vector3;
  end: THREE.Vector3;
  distance: number;
  pairKind: MeasurePairKind;
  pairLabelEs: string;
  noteEs?: string;
  guides: MeasureGuideSegment[];
}

function normalizedUnit(vec: THREE.Vector3): THREE.Vector3 | null {
  const lenSq = vec.lengthSq();
  if (lenSq <= 1e-12) return null;
  return vec.clone().divideScalar(Math.sqrt(lenSq));
}

function appendSegmentExtensionGuide(
  guides: MeasureGuideSegment[],
  segStart: THREE.Vector3,
  segEnd: THREE.Vector3,
  segLen: number,
  paramAlongDir: number,
  projectedPoint: THREE.Vector3
): void {
  if (paramAlongDir < -1e-4) {
    guides.push({ start: projectedPoint.clone(), end: segStart.clone() });
  } else if (paramAlongDir > segLen + 1e-4) {
    guides.push({ start: segEnd.clone(), end: projectedPoint.clone() });
  }
}

function computePointToEdge(
  pointRef: MeasureSnapTarget,
  edgeRef: MeasureSnapTarget,
  pointFirst: boolean
): ComputedMeasurement {
  const p = pointRef.point.clone();
  const e0 = edgeRef.edgeStart;
  const e1 = edgeRef.edgeEnd;
  const dir = e0 && e1 ? normalizedUnit(new THREE.Vector3().subVectors(e1, e0)) : null;

  if (!e0 || !e1 || !dir) {
    const q = edgeRef.point.clone();
    const start = pointFirst ? p : q;
    const end = pointFirst ? q : p;
    return {
      start,
      end,
      distance: start.distanceTo(end),
      pairKind: 'point-edge',
      pairLabelEs: 'Punto a arista',
      guides: [],
    };
  }

  const segLen = e0.distanceTo(e1);
  const s = new THREE.Vector3().subVectors(p, e0).dot(dir);
  const q = e0.clone().addScaledVector(dir, s);
  const guides: MeasureGuideSegment[] = [];
  appendSegmentExtensionGuide(guides, e0, e1, segLen, s, q);

  const start = pointFirst ? p : q;
  const end = pointFirst ? q : p;

  return {
    start,
    end,
    distance: start.distanceTo(end),
    pairKind: 'point-edge',
    pairLabelEs: 'Punto a arista',
    guides,
  };
}

function computeEdgeToEdge(
  a: MeasureSnapTarget,
  b: MeasureSnapTarget
): ComputedMeasurement {
  const a0 = a.edgeStart;
  const a1 = a.edgeEnd;
  const b0 = b.edgeStart;
  const b1 = b.edgeEnd;

  const u1 = a0 && a1 ? normalizedUnit(new THREE.Vector3().subVectors(a1, a0)) : null;
  const u2 = b0 && b1 ? normalizedUnit(new THREE.Vector3().subVectors(b1, b0)) : null;

  if (!a0 || !a1 || !b0 || !b1 || !u1 || !u2) {
    const start = a.point.clone();
    const end = b.point.clone();
    return {
      start,
      end,
      distance: start.distanceTo(end),
      pairKind: 'edge-edge',
      pairLabelEs: 'Arista a arista',
      guides: [],
    };
  }

  const len1 = a0.distanceTo(a1);
  const len2 = b0.distanceTo(b1);
  const w0 = new THREE.Vector3().subVectors(a0, b0);
  const cosAngle = u1.dot(u2);
  const d = u1.dot(w0);
  const e = u2.dot(w0);
  const denom = 1 - cosAngle * cosAngle;

  const guides: MeasureGuideSegment[] = [];

  // Parallel (or nearly parallel < ~0.57 deg) lines: drop perpendicular between them
  const buildParallel = (noteEs?: string): ComputedMeasurement => {
    const p1Try = a.point.clone();
    const tTry = new THREE.Vector3().subVectors(p1Try, b0).dot(u2);
    let p1 = p1Try;
    let p2 = b0.clone().addScaledVector(u2, tTry);
    let sParam = new THREE.Vector3().subVectors(p1, a0).dot(u1);
    let tParam = tTry;

    // If p1's projection misses segment 2, check if b.point projects onto segment 1
    if (tTry < -1e-4 || tTry > len2 + 1e-4) {
      const p2Try = b.point.clone();
      const sBack = new THREE.Vector3().subVectors(p2Try, a0).dot(u1);
      if (sBack >= -1e-4 && sBack <= len1 + 1e-4) {
        p1 = a0.clone().addScaledVector(u1, sBack);
        p2 = p2Try;
        sParam = sBack;
        tParam = new THREE.Vector3().subVectors(p2, b0).dot(u2);
      }
    }

    appendSegmentExtensionGuide(guides, a0, a1, len1, sParam, p1);
    appendSegmentExtensionGuide(guides, b0, b1, len2, tParam, p2);

    return {
      start: p1,
      end: p2,
      distance: p1.distanceTo(p2),
      pairKind: 'edge-edge',
      pairLabelEs: 'Arista a arista',
      noteEs,
      guides,
    };
  };

  if (denom < 1e-4) {
    return buildParallel('Aristas paralelas');
  }

  const s = (cosAngle * e - d) / denom;
  const t = (e - cosAngle * d) / denom;
  const maxReach = Math.max(len1, len2, 50) * 10;

  if (!Number.isFinite(s) || !Number.isFinite(t) || Math.abs(s) > maxReach || Math.abs(t) > maxReach) {
    return buildParallel('Aristas casi paralelas');
  }

  const p1 = a0.clone().addScaledVector(u1, s);
  const p2 = b0.clone().addScaledVector(u2, t);
  appendSegmentExtensionGuide(guides, a0, a1, len1, s, p1);
  appendSegmentExtensionGuide(guides, b0, b1, len2, t, p2);

  return {
    start: p1,
    end: p2,
    distance: p1.distanceTo(p2),
    pairKind: 'edge-edge',
    pairLabelEs: 'Arista a arista',
    guides,
  };
}

function computePointToPlane(
  pointRef: MeasureSnapTarget,
  planeRef: MeasureSnapTarget,
  pointFirst: boolean
): ComputedMeasurement {
  const p = pointRef.point.clone();
  const f0 = planeRef.point.clone();
  const n = planeRef.normal ? normalizedUnit(planeRef.normal) : null;

  if (!n) {
    const start = pointFirst ? p : f0;
    const end = pointFirst ? f0 : p;
    return {
      start,
      end,
      distance: start.distanceTo(end),
      pairKind: 'point-plane',
      pairLabelEs: 'Punto a plano',
      guides: [],
    };
  }

  const signed = new THREE.Vector3().subVectors(p, f0).dot(n);
  const q = p.clone().addScaledVector(n, -signed);
  const guides: MeasureGuideSegment[] = [];
  const footDist = q.distanceTo(f0);
  if (footDist > 0.05 && footDist < 200) {
    guides.push({ start: q.clone(), end: f0.clone() });
  }

  const start = pointFirst ? p : q;
  const end = pointFirst ? q : p;

  return {
    start,
    end,
    distance: Math.abs(signed),
    pairKind: 'point-plane',
    pairLabelEs: 'Punto a plano',
    guides,
  };
}

function computeEdgeToPlane(
  edgeRef: MeasureSnapTarget,
  planeRef: MeasureSnapTarget,
  edgeFirst: boolean
): ComputedMeasurement {
  const e0 = edgeRef.edgeStart;
  const e1 = edgeRef.edgeEnd;
  const f0 = planeRef.point.clone();
  const n = planeRef.normal ? normalizedUnit(planeRef.normal) : null;
  const dir = e0 && e1 ? normalizedUnit(new THREE.Vector3().subVectors(e1, e0)) : null;

  if (!n) {
    const start = edgeFirst ? edgeRef.point.clone() : f0;
    const end = edgeFirst ? f0 : edgeRef.point.clone();
    return {
      start,
      end,
      distance: start.distanceTo(end),
      pairKind: 'edge-plane',
      pairLabelEs: 'Arista a plano',
      guides: [],
    };
  }

  if (!e0 || !e1 || !dir) {
    const base = computePointToPlane(edgeRef, planeRef, edgeFirst);
    return {
      ...base,
      pairKind: 'edge-plane',
      pairLabelEs: 'Arista a plano',
    };
  }

  const guides: MeasureGuideSegment[] = [];
  let pEdge: THREE.Vector3;
  let qPlane: THREE.Vector3;
  let noteEs: string | undefined;

  if (Math.abs(dir.dot(n)) < 1e-3) {
    // Edge parallel to plane: constant perpendicular distance along entire edge
    pEdge = edgeRef.point.clone();
    const signed = new THREE.Vector3().subVectors(pEdge, f0).dot(n);
    qPlane = pEdge.clone().addScaledVector(n, -signed);
    noteEs = 'Paralela al plano';
  } else {
    const d0 = new THREE.Vector3().subVectors(e0, f0).dot(n);
    const d1 = new THREE.Vector3().subVectors(e1, f0).dot(n);
    if (d0 * d1 <= 0) {
      const denom = Math.abs(d0) + Math.abs(d1);
      const t = denom > 1e-12 ? Math.abs(d0) / denom : 0;
      pEdge = e0.clone().lerp(e1, t);
      qPlane = pEdge.clone();
      noteEs = 'La arista cruza el plano';
    } else {
      const useStart = Math.abs(d0) <= Math.abs(d1);
      pEdge = (useStart ? e0 : e1).clone();
      const signed = useStart ? d0 : d1;
      qPlane = pEdge.clone().addScaledVector(n, -signed);
      noteEs = 'Distancia mínima al plano';
    }
  }

  const footDist = qPlane.distanceTo(f0);
  if (footDist > 0.05 && footDist < 200) {
    guides.push({ start: qPlane.clone(), end: f0.clone() });
  }

  const start = edgeFirst ? pEdge : qPlane;
  const end = edgeFirst ? qPlane : pEdge;

  return {
    start,
    end,
    distance: start.distanceTo(end),
    pairKind: 'edge-plane',
    pairLabelEs: 'Arista a plano',
    noteEs,
    guides,
  };
}

function computePlaneToPlane(
  a: MeasureSnapTarget,
  b: MeasureSnapTarget
): ComputedMeasurement {
  const f1 = a.point.clone();
  const f2 = b.point.clone();
  const n1 = a.normal ? normalizedUnit(a.normal) : null;
  const n2 = b.normal ? normalizedUnit(b.normal) : null;

  if (!n1) {
    return {
      start: f1,
      end: f2,
      distance: f1.distanceTo(f2),
      pairKind: 'plane-plane',
      pairLabelEs: 'Plano a plano',
      guides: [],
    };
  }

  // Drop perpendicular from target cursor point f2 onto reference plane 1
  const signed = new THREE.Vector3().subVectors(f2, f1).dot(n1);
  const p1 = f2.clone().addScaledVector(n1, -signed);
  const guides: MeasureGuideSegment[] = [];
  const footDist = p1.distanceTo(f1);
  if (footDist > 0.05 && footDist < 200) {
    guides.push({ start: p1.clone(), end: f1.clone() });
  }

  const isParallel = n2 ? Math.abs(n1.dot(n2)) >= 1 - 1e-4 : false;

  return {
    start: p1,
    end: f2,
    distance: Math.abs(signed),
    pairKind: 'plane-plane',
    pairLabelEs: 'Plano a plano',
    noteEs: n2 ? (isParallel ? 'Planos paralelos' : 'Dist. perpendicular al primer plano') : undefined,
    guides,
  };
}

/**
 * Computes the true 3D measurement segment and extension guides for any pair of
 * snapped BIM/CAD references (vertex point, edge line, or face plane).
 */
export function computeMeasurementBetweenTargets(
  a: MeasureSnapTarget,
  b: MeasureSnapTarget
): ComputedMeasurement {
  if (a.kind === 'point' && b.kind === 'point') {
    const start = a.point.clone();
    const end = b.point.clone();
    return {
      start,
      end,
      distance: start.distanceTo(end),
      pairKind: 'point-point',
      pairLabelEs: 'Punto a punto',
      guides: [],
    };
  }

  if (a.kind === 'point' && b.kind === 'line') {
    return computePointToEdge(a, b, true);
  }
  if (a.kind === 'line' && b.kind === 'point') {
    return computePointToEdge(b, a, false);
  }

  if (a.kind === 'line' && b.kind === 'line') {
    return computeEdgeToEdge(a, b);
  }

  if (a.kind === 'point' && b.kind === 'face') {
    return computePointToPlane(a, b, true);
  }
  if (a.kind === 'face' && b.kind === 'point') {
    return computePointToPlane(b, a, false);
  }

  if (a.kind === 'line' && b.kind === 'face') {
    return computeEdgeToPlane(a, b, true);
  }
  if (a.kind === 'face' && b.kind === 'line') {
    return computeEdgeToPlane(b, a, false);
  }

  return computePlaneToPlane(a, b);
}

export interface AreaFaceMeasurement {
  key: string;
  area: number;
  labelPoint: THREE.Vector3;
  normal: THREE.Vector3;
  facePoints: Float32Array;
  triIndices?: number[];
  modelId?: string;
  localId?: number;
}

export interface VolumeElementMeasurement {
  key: string;
  volume: number;
  center: THREE.Vector3;
  modelId: string;
  localId: number;
}

function buildPlanarBasis(normal: THREE.Vector3): {
  unitN: THREE.Vector3;
  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;
} {
  const unitN =
    normal.lengthSq() > 1e-8
      ? normal.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
  const up =
    Math.abs(unitN.z) < 0.9
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(1, 0, 0);
  const uAxis = new THREE.Vector3().crossVectors(up, unitN).normalize();
  const vAxis = new THREE.Vector3().crossVectors(unitN, uAxis).normalize();
  return { unitN, uAxis, vAxis };
}

function isPointInPolygon2D(px: number, py: number, poly: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersects =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Triangulates a planar 3D polygon boundary loop for overlay rendering.
 */
export function triangulatePlanarFace(
  facePoints: Float32Array | Float64Array,
  normal?: THREE.Vector3
): { flatIndices: number[]; loopPositions: number[] } {
  const vertCount = Math.floor(facePoints.length / 3);
  if (vertCount < 3) {
    return { flatIndices: [], loopPositions: [] };
  }

  const unitN = normal && normal.lengthSq() > 1e-8 ? normal : new THREE.Vector3(0, 1, 0);
  const { uAxis, vAxis } = buildPlanarBasis(unitN);

  const p0 = new THREE.Vector3(facePoints[0], facePoints[1], facePoints[2]);
  const pts2D: THREE.Vector2[] = [];
  const loopPositions: number[] = [];

  for (let i = 0; i < vertCount; i++) {
    const x = facePoints[i * 3];
    const y = facePoints[i * 3 + 1];
    const z = facePoints[i * 3 + 2];
    loopPositions.push(x, y, z);
    const dx = x - p0.x;
    const dy = y - p0.y;
    const dz = z - p0.z;
    pts2D.push(
      new THREE.Vector2(
        dx * uAxis.x + dy * uAxis.y + dz * uAxis.z,
        dx * vAxis.x + dy * vAxis.y + dz * vAxis.z
      )
    );
  }
  loopPositions.push(facePoints[0], facePoints[1], facePoints[2]);

  let triIndices = THREE.ShapeUtils.triangulateShape(pts2D, []);
  if (triIndices.length === 0) {
    triIndices = [];
    for (let i = 1; i < vertCount - 1; i++) {
      triIndices.push([0, i, i + 1]);
    }
  }

  const flatIndices: number[] = [];
  for (const tri of triIndices) {
    flatIndices.push(tri[0], tri[1], tri[2]);
  }

  return { flatIndices, loopPositions };
}

/**
 * Computes exact 3D area and label placement point for a planar polygon face.
 */
export function computePlanarFaceAreaAndLabelPoint(
  facePoints: Float32Array | Float64Array,
  normal: THREE.Vector3,
  fallbackHitPoint?: THREE.Vector3
): { area: number; labelPoint: THREE.Vector3; centroid: THREE.Vector3 } {
  const vertCount = Math.floor(facePoints.length / 3);
  if (vertCount < 3) {
    const fallback = fallbackHitPoint ? fallbackHitPoint.clone() : new THREE.Vector3();
    return { area: 0, labelPoint: fallback.clone(), centroid: fallback };
  }

  const { unitN, uAxis, vAxis } = buildPlanarBasis(normal);
  const p0x = facePoints[0];
  const p0y = facePoints[1];
  const p0z = facePoints[2];

  const pts2D: THREE.Vector2[] = [];
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  for (let i = 0; i < vertCount; i++) {
    const x = facePoints[i * 3];
    const y = facePoints[i * 3 + 1];
    const z = facePoints[i * 3 + 2];
    sumX += x;
    sumY += y;
    sumZ += z;
    const dx = x - p0x;
    const dy = y - p0y;
    const dz = z - p0z;
    pts2D.push(
      new THREE.Vector2(
        dx * uAxis.x + dy * uAxis.y + dz * uAxis.z,
        dx * vAxis.x + dy * vAxis.y + dz * vAxis.z
      )
    );
  }

  let signedArea2D = 0;
  let cx2D = 0;
  let cy2D = 0;
  for (let i = 0; i < pts2D.length; i++) {
    const a = pts2D[i];
    const b = pts2D[(i + 1) % pts2D.length];
    const cross = a.x * b.y - b.x * a.y;
    signedArea2D += cross;
    cx2D += (a.x + b.x) * cross;
    cy2D += (a.y + b.y) * cross;
  }

  const area = Math.abs(signedArea2D) * 0.5;
  let centroid: THREE.Vector3;

  if (Math.abs(signedArea2D) > 1e-10) {
    const u = cx2D / (3 * signedArea2D);
    const v = cy2D / (3 * signedArea2D);
    centroid = new THREE.Vector3(
      p0x + uAxis.x * u + vAxis.x * v,
      p0y + uAxis.y * u + vAxis.y * v,
      p0z + uAxis.z * u + vAxis.z * v
    );
  } else {
    centroid = new THREE.Vector3(sumX / vertCount, sumY / vertCount, sumZ / vertCount);
  }

  // Keep the 3D label inside the polygon when faces have concave notches or openings
  let labelPoint = centroid.clone();
  if (fallbackHitPoint) {
    const dx = centroid.x - p0x;
    const dy = centroid.y - p0y;
    const dz = centroid.z - p0z;
    const cu = dx * uAxis.x + dy * uAxis.y + dz * uAxis.z;
    const cv = dx * vAxis.x + dy * vAxis.y + dz * vAxis.z;
    if (!isPointInPolygon2D(cu, cv, pts2D)) {
      labelPoint = fallbackHitPoint.clone();
    }
  }
  // Nudge slightly along outward normal to keep above coplanar Z-fighting
  labelPoint.addScaledVector(unitN, 0.005);

  return { area, labelPoint, centroid };
}

interface CoplanarRegionResult {
  area: number;
  labelPoint: THREE.Vector3;
  positions: Float32Array;
  triIndices: number[];
}

function triangleVertKey(v: THREE.Vector3): string {
  return `${Math.round(v.x * 1000)}_${Math.round(v.y * 1000)}_${Math.round(v.z * 1000)}`;
}

function floodFillCoplanarTriangles(
  coplanarTris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][],
  vertToTris: Map<string, number[]>,
  seedIdx: number,
  hitPoint: THREE.Vector3,
  unitN: THREE.Vector3
): CoplanarRegionResult {
  const visited = new Set<number>([seedIdx]);
  const queue = [seedIdx];
  const flatPositions: number[] = [];
  const triIndices: number[] = [];
  let totalArea = 0;
  const centroidAcc = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const triN = new THREE.Vector3();

  while (queue.length > 0) {
    const cur = queue.pop()!;
    const verts = coplanarTris[cur];
    if (!verts) continue;

    const baseIdx = flatPositions.length / 3;
    flatPositions.push(
      verts[0].x,
      verts[0].y,
      verts[0].z,
      verts[1].x,
      verts[1].y,
      verts[1].z,
      verts[2].x,
      verts[2].y,
      verts[2].z
    );
    triIndices.push(baseIdx, baseIdx + 1, baseIdx + 2);

    e1.subVectors(verts[1], verts[0]);
    e2.subVectors(verts[2], verts[0]);
    const triArea = 0.5 * triN.crossVectors(e1, e2).length();
    totalArea += triArea;
    centroidAcc
      .addScaledVector(verts[0], triArea / 3)
      .addScaledVector(verts[1], triArea / 3)
      .addScaledVector(verts[2], triArea / 3);

    for (const v of verts) {
      const neighbors = vertToTris.get(triangleVertKey(v));
      if (!neighbors) continue;
      for (const nIdx of neighbors) {
        if (!visited.has(nIdx)) {
          visited.add(nIdx);
          queue.push(nIdx);
        }
      }
    }
  }

  const labelPoint =
    totalArea > 1e-10 ? centroidAcc.divideScalar(totalArea) : hitPoint.clone();
  labelPoint.addScaledVector(unitN, 0.005);

  return {
    area: totalArea,
    labelPoint,
    positions: new Float32Array(flatPositions),
    triIndices,
  };
}

function tryAddCoplanarTriangle(
  coplanarTris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][],
  vertToTris: Map<string, number[]>,
  verts: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  unitN: THREE.Vector3,
  planeDist: number,
  e1: THREE.Vector3,
  e2: THREE.Vector3,
  triN: THREE.Vector3
): number | null {
  e1.subVectors(verts[1], verts[0]);
  e2.subVectors(verts[2], verts[0]);
  triN.crossVectors(e1, e2);
  if (triN.lengthSq() <= 1e-12) return null;
  triN.normalize();
  if (Math.abs(triN.dot(unitN)) < 0.998) return null;
  if (
    Math.abs(unitN.dot(verts[0]) - planeDist) > 1e-2 ||
    Math.abs(unitN.dot(verts[1]) - planeDist) > 1e-2 ||
    Math.abs(unitN.dot(verts[2]) - planeDist) > 1e-2
  ) {
    return null;
  }

  const triIdx = coplanarTris.length;
  coplanarTris.push(verts);
  for (const v of verts) {
    const k = triangleVertKey(v);
    const list = vertToTris.get(k);
    if (list) list.push(triIdx);
    else vertToTris.set(k, [triIdx]);
  }
  return triIdx;
}

/**
 * Flood-fills coplanar connected triangles on a THREE.Mesh starting from a picked triangle
 * (fallback when Fragments SnapResolvers doesn't provide a face polygon).
 */
export function collectCoplanarMeshRegion(
  mesh: THREE.Mesh,
  startFaceIndex: number,
  hitPoint: THREE.Vector3,
  worldNormal: THREE.Vector3,
  instanceId?: number
): CoplanarRegionResult | null {
  const posAttr = mesh.geometry?.getAttribute?.('position');
  if (!posAttr) return null;

  const matrix = mesh.matrixWorld.clone();
  if (mesh instanceof THREE.InstancedMesh && instanceId !== undefined) {
    const instMat = new THREE.Matrix4();
    mesh.getMatrixAt(instanceId, instMat);
    matrix.multiply(instMat);
  }

  const indexAttr = mesh.geometry.getIndex();
  const triCount = indexAttr
    ? Math.floor(indexAttr.count / 3)
    : Math.floor(posAttr.count / 3);
  if (startFaceIndex < 0 || startFaceIndex >= triCount) return null;

  const unitN = worldNormal.clone().normalize();
  const planeDist = unitN.dot(hitPoint);

  const readTriVerts = (t: number): [THREE.Vector3, THREE.Vector3, THREE.Vector3] => {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
    return [
      new THREE.Vector3().fromBufferAttribute(posAttr, i0).applyMatrix4(matrix),
      new THREE.Vector3().fromBufferAttribute(posAttr, i1).applyMatrix4(matrix),
      new THREE.Vector3().fromBufferAttribute(posAttr, i2).applyMatrix4(matrix),
    ];
  };

  const coplanarTris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  const vertToTris = new Map<string, number[]>();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const triN = new THREE.Vector3();
  let seedIdx = -1;

  for (let t = 0; t < triCount; t++) {
    const added = tryAddCoplanarTriangle(
      coplanarTris,
      vertToTris,
      readTriVerts(t),
      unitN,
      planeDist,
      e1,
      e2,
      triN
    );
    if (added !== null && t === startFaceIndex) {
      seedIdx = added;
    }
  }

  if (seedIdx === -1) {
    seedIdx = coplanarTris.length;
    coplanarTris.push(readTriVerts(startFaceIndex));
  }

  return floodFillCoplanarTriangles(coplanarTris, vertToTris, seedIdx, hitPoint, unitN);
}

function toMatrix4(transform: unknown): THREE.Matrix4 | null {
  if (!transform) return null;
  if (transform instanceof THREE.Matrix4) return transform;
  if (
    typeof transform === 'object' &&
    transform !== null &&
    'elements' in transform &&
    Array.isArray((transform as { elements?: unknown }).elements) &&
    (transform as { elements: number[] }).elements.length === 16
  ) {
    return new THREE.Matrix4().fromArray((transform as { elements: number[] }).elements);
  }
  return null;
}

/**
 * Flood-fills coplanar triangles within a Fragments item's MeshData[] around hitPoint
 * when SnapResolvers does not return planar polygon boundary points.
 */
export function collectCoplanarFragmentFaceArea(
  meshes: FRAGS.MeshData[],
  hitPoint: THREE.Vector3,
  worldNormal: THREE.Vector3,
  modelMatrixWorld?: THREE.Matrix4
): CoplanarRegionResult | null {
  if (!meshes || meshes.length === 0) return null;

  const unitN = worldNormal.clone().normalize();
  const planeDist = unitN.dot(hitPoint);
  const coplanarTris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  const vertToTris = new Map<string, number[]>();

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const triN = new THREE.Vector3();

  for (const mesh of meshes) {
    const { positions, indices, transform } = mesh;
    if (!positions || positions.length < 9) continue;
    const meshMatrix = toMatrix4(transform);
    const fullMatrix =
      modelMatrixWorld && meshMatrix
        ? modelMatrixWorld.clone().multiply(meshMatrix)
        : modelMatrixWorld ?? meshMatrix;
    const vertCount = Math.floor(positions.length / 3);
    const triCount = indices
      ? Math.floor(indices.length / 3)
      : Math.floor(vertCount / 3);

    for (let t = 0; t < triCount; t++) {
      const i0 = indices ? indices[t * 3] : t * 3;
      const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
      const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;
      if (i0 >= vertCount || i1 >= vertCount || i2 >= vertCount) continue;

      v0.set(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
      v1.set(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
      v2.set(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);
      if (fullMatrix) {
        v0.applyMatrix4(fullMatrix);
        v1.applyMatrix4(fullMatrix);
        v2.applyMatrix4(fullMatrix);
      }

      tryAddCoplanarTriangle(
        coplanarTris,
        vertToTris,
        [v0.clone(), v1.clone(), v2.clone()],
        unitN,
        planeDist,
        e1,
        e2,
        triN
      );
    }
  }

  if (coplanarTris.length === 0) return null;

  let seedIdx = 0;
  let bestDistSq = Infinity;
  const triCenter = new THREE.Vector3();
  for (let i = 0; i < coplanarTris.length; i++) {
    const [a, b, c] = coplanarTris[i];
    triCenter.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const dSq = triCenter.distanceToSquared(hitPoint);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      seedIdx = i;
    }
  }

  return floodFillCoplanarTriangles(coplanarTris, vertToTris, seedIdx, hitPoint, unitN);
}


