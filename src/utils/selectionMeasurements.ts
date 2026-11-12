import type * as OBC from '@thatopen/components';
import type * as FRAGS from '@thatopen/fragments';
import * as THREE from 'three';

const DATA_CHUNK_SIZE = 120;
const GEOM_CHUNK_SIZE = 40;
const BOX_CHUNK_SIZE = 200;
const MAX_DETAILED_GEOMETRY_ITEMS = 500;

export type MeasurementSource = 'ifc' | 'geometry' | 'mixed' | 'none';

export interface MetricSummary {
  total: number;
  ifcTotal: number;
  ifcCount: number;
  geometryTotal: number;
  geometryCount: number;
  source: MeasurementSource;
}

export interface ElementMeasurementEntry {
  modelId: string;
  modelName: string;
  localId: number;
  name: string;
  category: string;
  ifcLength: number | null;
  ifcArea: number | null;
  ifcVolume: number | null;
  geomLength: number | null;
  geomArea: number | null;
  geomVolume: number | null;
  effectiveLength: number | null;
  effectiveArea: number | null;
  effectiveVolume: number | null;
  dimensions: {
    length: number;
    width: number;
    height: number;
  } | null;
}

export interface CategoryMeasurementSummary {
  category: string;
  count: number;
  lengthTotal: number;
  areaTotal: number;
  volumeTotal: number;
}

export interface SelectionMeasurementsResult {
  totalCount: number;
  modelCount: number;
  length: MetricSummary;
  area: MetricSummary;
  volume: MetricSummary;
  boundingDimensions: {
    length: number;
    width: number;
    height: number;
  } | null;
  categories: CategoryMeasurementSummary[];
  elements: ElementMeasurementEntry[];
  geometrySurfaceSkipped: boolean;
}

interface ExtractedIfcQuantities {
  length: number | null;
  area: number | null;
  volume: number | null;
}

interface RankedCandidate {
  rank: number;
  value: number;
}

export interface ComputedMeshMetrics {
  geomLength: number;
  geomArea: number;
  geomVolume: number;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
}

function readAttrString(attr: unknown): string | null {
  if (attr === null || attr === undefined) return null;
  if (typeof attr === 'object' && 'value' in (attr as Record<string, unknown>)) {
    const inner = (attr as Record<string, unknown>).value;
    if (inner === null || inner === undefined) return null;
    const text = String(inner).trim();
    return text.length > 0 ? text : null;
  }
  const text = String(attr).trim();
  return text.length > 0 ? text : null;
}

function readAttrNumber(attr: unknown): number | null {
  if (attr === null || attr === undefined) return null;
  const raw =
    typeof attr === 'object' && 'value' in (attr as Record<string, unknown>)
      ? (attr as Record<string, unknown>).value
      : attr;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeQuantityKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function classifyLengthRank(normName: string): number | null {
  if (
    normName.includes('perimeter') ||
    normName.includes('perimetro') ||
    normName.includes('width') ||
    normName.includes('ancho') ||
    normName.includes('thickness') ||
    normName.includes('espesor') ||
    normName.includes('grosor') ||
    normName.includes('depth') ||
    normName.includes('profundidad') ||
    normName.includes('radius') ||
    normName.includes('diameter') ||
    normName.includes('clearance') ||
    normName.includes('offset')
  ) {
    return null;
  }

  if (
    normName === 'netlength' ||
    normName === 'length' ||
    normName === 'longitud' ||
    normName === 'largo'
  ) {
    return 100;
  }
  if (
    normName === 'grosslength' ||
    normName === 'nominallength' ||
    normName === 'totallength' ||
    normName === 'span'
  ) {
    return 90;
  }
  if (normName.endsWith('length') || normName.endsWith('longitud')) {
    return 75;
  }
  return null;
}

function classifyAreaRank(normName: string): number | null {
  if (
    normName === 'netarea' ||
    normName === 'area' ||
    normName === 'superficie'
  ) {
    return 100;
  }
  if (normName === 'grossarea') return 95;
  if (normName === 'netfootprintarea') return 90;
  if (normName === 'grossfootprintarea' || normName === 'footprintarea') {
    return 85;
  }
  if (normName === 'netsidearea') return 80;
  if (normName === 'grosssidearea' || normName === 'sidearea') return 75;
  if (normName === 'crosssectionarea') return 70;
  if (normName === 'netsurfacearea' || normName === 'surfacearea') return 65;
  if (normName === 'grosssurfacearea' || normName === 'outersurfacearea') {
    return 60;
  }
  if (normName.endsWith('area') || normName.includes('superficie')) return 50;
  return null;
}

function classifyVolumeRank(normName: string): number | null {
  if (
    normName === 'netvolume' ||
    normName === 'volume' ||
    normName === 'volumen'
  ) {
    return 100;
  }
  if (normName === 'grossvolume') return 90;
  if (normName.endsWith('volume') || normName.endsWith('volumen')) return 75;
  return null;
}

function pickBestCandidate(
  current: RankedCandidate | null,
  rank: number | null,
  value: number | null,
): RankedCandidate | null {
  if (rank === null || value === null || !Number.isFinite(value) || value < 0) {
    return current;
  }
  if (!current || rank > current.rank) {
    return { rank, value };
  }
  return current;
}

function extractIfcQuantities(item: FRAGS.ItemData): ExtractedIfcQuantities {
  let bestLength: RankedCandidate | null = null;
  let bestArea: RankedCandidate | null = null;
  let bestVolume: RankedCandidate | null = null;

  const isDefinedBy = item.IsDefinedBy;
  if (Array.isArray(isDefinedBy)) {
    for (const relEntry of isDefinedBy) {
      if (!relEntry || typeof relEntry !== 'object') continue;
      const rel = relEntry as Record<string, unknown>;

      if (Array.isArray(rel.Quantities)) {
        for (const qEntry of rel.Quantities) {
          if (!qEntry || typeof qEntry !== 'object') continue;
          const q = qEntry as Record<string, unknown>;
          const qName = readAttrString(q.Name);
          if (!qName) continue;
          const normName = normalizeQuantityKey(qName);

          const lenVal = readAttrNumber(q.LengthValue);
          if (lenVal !== null) {
            bestLength = pickBestCandidate(
              bestLength,
              classifyLengthRank(normName),
              lenVal,
            );
          }

          const areaVal = readAttrNumber(q.AreaValue);
          if (areaVal !== null) {
            bestArea = pickBestCandidate(
              bestArea,
              classifyAreaRank(normName) ?? 40,
              areaVal,
            );
          }

          const volVal = readAttrNumber(q.VolumeValue);
          if (volVal !== null) {
            bestVolume = pickBestCandidate(
              bestVolume,
              classifyVolumeRank(normName) ?? 40,
              volVal,
            );
          }
        }
      }

      if (Array.isArray(rel.HasProperties)) {
        for (const pEntry of rel.HasProperties) {
          if (!pEntry || typeof pEntry !== 'object') continue;
          const prop = pEntry as Record<string, unknown>;
          const pName = readAttrString(prop.Name);
          if (!pName) continue;
          const numVal = readAttrNumber(prop.NominalValue);
          if (numVal === null) continue;

          const normName = normalizeQuantityKey(pName);
          bestLength = pickBestCandidate(
            bestLength,
            classifyLengthRank(normName),
            numVal,
          );
          bestArea = pickBestCandidate(
            bestArea,
            classifyAreaRank(normName),
            numVal,
          );
          bestVolume = pickBestCandidate(
            bestVolume,
            classifyVolumeRank(normName),
            numVal,
          );
        }
      }
    }
  }

  return {
    length: bestLength?.value ?? null,
    area: bestArea?.value ?? null,
    volume: bestVolume?.value ?? null,
  };
}

type OrthonormalBasis = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

function solveJacobi3x3(
  cxx: number,
  cyy: number,
  czz: number,
  cxy: number,
  cxz: number,
  cyz: number,
): OrthonormalBasis {
  const a = [
    [cxx, cxy, cxz],
    [cxy, cyy, cyz],
    [cxz, cyz, czz],
  ];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let iter = 0; iter < 24; iter++) {
    let p = 0;
    let q = 1;
    let maxOff = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > maxOff) {
      maxOff = Math.abs(a[0][2]);
      p = 0;
      q = 2;
    }
    if (Math.abs(a[1][2]) > maxOff) {
      maxOff = Math.abs(a[1][2]);
      p = 1;
      q = 2;
    }
    if (maxOff < 1e-12) break;

    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi);
    const s = Math.sin(phi);

    for (let r = 0; r < 3; r++) {
      if (r === p || r === q) continue;
      const arp = a[r][p];
      const arq = a[r][q];
      a[r][p] = a[p][r] = c * arp - s * arq;
      a[r][q] = a[q][r] = s * arp + c * arq;
    }

    a[p][p] = c * c * app - 2 * c * s * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * c * s * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;

    for (let r = 0; r < 3; r++) {
      const vrp = v[r][p];
      const vrq = v[r][q];
      v[r][p] = c * vrp - s * vrq;
      v[r][q] = s * vrp + c * vrq;
    }
  }

  return [
    new THREE.Vector3(v[0][0], v[1][0], v[2][0]).normalize(),
    new THREE.Vector3(v[0][1], v[1][1], v[2][1]).normalize(),
    new THREE.Vector3(v[0][2], v[1][2], v[2][2]).normalize(),
  ];
}

function toMatrix4(rawTransform: unknown): THREE.Matrix4 | null {
  if (!rawTransform) return null;
  if (rawTransform instanceof THREE.Matrix4) {
    return rawTransform;
  }
  if (
    typeof rawTransform === 'object' &&
    'elements' in (rawTransform as Record<string, unknown>)
  ) {
    const elems = (rawTransform as { elements?: ArrayLike<number> }).elements;
    if (elems && elems.length === 16) {
      return new THREE.Matrix4().fromArray(elems);
    }
  }
  if (Array.isArray(rawTransform) || ArrayBuffer.isView(rawTransform)) {
    const elems = rawTransform as ArrayLike<number>;
    if (elems.length === 16) {
      return new THREE.Matrix4().fromArray(elems);
    }
  }
  return null;
}

function extractTransformBasis(
  rawTransform?: unknown,
): OrthonormalBasis | null {
  const transform = toMatrix4(rawTransform);
  if (!transform) return null;
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  transform.extractBasis(xAxis, yAxis, zAxis);

  if (xAxis.lengthSq() < 1e-10 || yAxis.lengthSq() < 1e-10) {
    return null;
  }

  xAxis.normalize();
  yAxis.addScaledVector(xAxis, -yAxis.dot(xAxis));
  if (yAxis.lengthSq() < 1e-10) return null;
  yAxis.normalize();
  zAxis.crossVectors(xAxis, yAxis).normalize();

  return [xAxis, yAxis, zAxis];
}

function measureExtentsAlongBasis(
  relVerts: number[],
  totalVerts: number,
  basis: OrthonormalBasis,
): { spans: [number, number, number]; volume: number; surface: number } {
  const [u0, u1, u2] = basis;
  let min0 = Infinity;
  let max0 = -Infinity;
  let min1 = Infinity;
  let max1 = -Infinity;
  let min2 = Infinity;
  let max2 = -Infinity;

  for (let i = 0; i < totalVerts; i++) {
    const base = i * 3;
    const x = relVerts[base];
    const y = relVerts[base + 1];
    const z = relVerts[base + 2];

    const d0 = x * u0.x + y * u0.y + z * u0.z;
    const d1 = x * u1.x + y * u1.y + z * u1.z;
    const d2 = x * u2.x + y * u2.y + z * u2.z;

    if (d0 < min0) min0 = d0;
    if (d0 > max0) max0 = d0;
    if (d1 < min1) min1 = d1;
    if (d1 > max1) max1 = d1;
    if (d2 < min2) min2 = d2;
    if (d2 > max2) max2 = d2;
  }

  const s0 = Math.max(0, max0 - min0);
  const s1 = Math.max(0, max1 - min1);
  const s2 = Math.max(0, max2 - min2);
  return {
    spans: [s0, s1, s2],
    volume: s0 * s1 * s2,
    surface: 2 * (s0 * s1 + s1 * s2 + s0 * s2),
  };
}

export function computeMeshMetrics(meshes: FRAGS.MeshData[]): ComputedMeshMetrics | null {
  if (!meshes || meshes.length === 0) return null;

  const relVerts: number[] = [];
  let totalArea = 0;
  let signedVolume = 0;

  let refX = 0;
  let refY = 0;
  let refZ = 0;
  let hasRef = false;

  // Area-weighted 3D moments over triangle surfaces (relative to ref)
  let momentAreaSum = 0;
  let sumWX = 0;
  let sumWY = 0;
  let sumWZ = 0;
  let mXX = 0;
  let mYY = 0;
  let mZZ = 0;
  let mXY = 0;
  let mXZ = 0;
  let mYZ = 0;

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const p = new THREE.Vector3();

  for (const mesh of meshes) {
    const { positions, indices, transform } = mesh;
    if (!positions || positions.length < 3) continue;

    const matrix = toMatrix4(transform);
    const vertCount = Math.floor(positions.length / 3);
    const startVertIdx = relVerts.length;

    for (let i = 0; i < vertCount; i++) {
      const base = i * 3;
      p.set(positions[base], positions[base + 1], positions[base + 2]);
      if (matrix) {
        p.applyMatrix4(matrix);
      }

      if (!hasRef) {
        refX = p.x;
        refY = p.y;
        refZ = p.z;
        hasRef = true;
      }

      relVerts.push(p.x - refX, p.y - refY, p.z - refZ);
    }

    const triCount = indices
      ? Math.floor(indices.length / 3)
      : Math.floor(vertCount / 3);

    for (let t = 0; t < triCount; t++) {
      const i0 = indices ? indices[t * 3] : t * 3;
      const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
      const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;

      if (i0 >= vertCount || i1 >= vertCount || i2 >= vertCount) continue;

      const b0 = startVertIdx + i0 * 3;
      const b1 = startVertIdx + i1 * 3;
      const b2 = startVertIdx + i2 * 3;

      v0.set(relVerts[b0], relVerts[b0 + 1], relVerts[b0 + 2]);
      v1.set(relVerts[b1], relVerts[b1 + 1], relVerts[b1 + 2]);
      v2.set(relVerts[b2], relVerts[b2 + 1], relVerts[b2 + 2]);

      e1.subVectors(v1, v0);
      e2.subVectors(v2, v0);
      cross.crossVectors(e1, e2);
      const triArea = 0.5 * cross.length();
      totalArea += triArea;

      if (triArea > 1e-12) {
        const cx = (v0.x + v1.x + v2.x) / 3;
        const cy = (v0.y + v1.y + v2.y) / 3;
        const cz = (v0.z + v1.z + v2.z) / 3;
        const factor = triArea / 12;

        momentAreaSum += triArea;
        sumWX += triArea * cx;
        sumWY += triArea * cy;
        sumWZ += triArea * cz;

        mXX += factor * (v0.x * v0.x + v1.x * v1.x + v2.x * v2.x + 9 * cx * cx);
        mYY += factor * (v0.y * v0.y + v1.y * v1.y + v2.y * v2.y + 9 * cy * cy);
        mZZ += factor * (v0.z * v0.z + v1.z * v1.z + v2.z * v2.z + 9 * cz * cz);
        mXY += factor * (v0.x * v0.y + v1.x * v1.y + v2.x * v2.y + 9 * cx * cy);
        mXZ += factor * (v0.x * v0.z + v1.x * v1.z + v2.x * v2.z + 9 * cx * cz);
        mYZ += factor * (v0.y * v0.z + v1.y * v1.z + v2.y * v2.z + 9 * cy * cz);
      }

      cross.crossVectors(v1, v2);
      signedVolume += v0.dot(cross) / 6;
    }
  }

  const totalVerts = relVerts.length / 3;
  if (totalVerts === 0 || !hasRef) return null;

  let covXX = 0;
  let covYY = 0;
  let covZZ = 0;
  let covXY = 0;
  let covXZ = 0;
  let covYZ = 0;

  if (momentAreaSum > 1e-12) {
    const meanX = sumWX / momentAreaSum;
    const meanY = sumWY / momentAreaSum;
    const meanZ = sumWZ / momentAreaSum;
    covXX = mXX / momentAreaSum - meanX * meanX;
    covYY = mYY / momentAreaSum - meanY * meanY;
    covZZ = mZZ / momentAreaSum - meanZ * meanZ;
    covXY = mXY / momentAreaSum - meanX * meanY;
    covXZ = mXZ / momentAreaSum - meanX * meanZ;
    covYZ = mYZ / momentAreaSum - meanY * meanZ;
  } else {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < totalVerts; i++) {
      sx += relVerts[i * 3];
      sy += relVerts[i * 3 + 1];
      sz += relVerts[i * 3 + 2];
    }
    const mx = sx / totalVerts;
    const my = sy / totalVerts;
    const mz = sz / totalVerts;
    for (let i = 0; i < totalVerts; i++) {
      const dx = relVerts[i * 3] - mx;
      const dy = relVerts[i * 3 + 1] - my;
      const dz = relVerts[i * 3 + 2] - mz;
      covXX += dx * dx;
      covYY += dy * dy;
      covZZ += dz * dz;
      covXY += dx * dy;
      covXZ += dx * dz;
      covYZ += dy * dz;
    }
  }

  const candidates: Array<{
    basis: OrthonormalBasis;
    priority: number;
  }> = [];

  const transformBasis = extractTransformBasis(meshes[0]?.transform);
  if (transformBasis) {
    candidates.push({ basis: transformBasis, priority: 0 });
  }

  const worldBasis: OrthonormalBasis = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  candidates.push({ basis: worldBasis, priority: 1 });

  const pcaBasis = solveJacobi3x3(covXX, covYY, covZZ, covXY, covXZ, covYZ);
  candidates.push({ basis: pcaBasis, priority: 2 });

  let bestBasis = worldBasis;
  let bestMeasure = measureExtentsAlongBasis(relVerts, totalVerts, worldBasis);
  let bestPriority = 99;

  for (const candidate of candidates) {
    const measured = measureExtentsAlongBasis(
      relVerts,
      totalVerts,
      candidate.basis,
    );
    const useSurface = bestMeasure.volume < 1e-9 && measured.volume < 1e-9;
    const bestMetric = useSurface ? bestMeasure.surface : bestMeasure.volume;
    const nextMetric = useSurface ? measured.surface : measured.volume;

    if (
      nextMetric < bestMetric * 0.99 ||
      (Math.abs(nextMetric - bestMetric) <= bestMetric * 0.01 &&
        candidate.priority < bestPriority)
    ) {
      bestBasis = candidate.basis;
      bestMeasure = measured;
      bestPriority = candidate.priority;
    }
  }

  // Assign the most vertically aligned local axis as height, and the remaining two as length / width
  let heightIdx = 0;
  let maxVerticalAlignment = Math.abs(bestBasis[0].y);
  for (let i = 1; i < 3; i++) {
    const alignment = Math.abs(bestBasis[i].y);
    if (alignment > maxVerticalAlignment) {
      maxVerticalAlignment = alignment;
      heightIdx = i;
    }
  }

  const remainingSpans: number[] = [];
  for (let i = 0; i < 3; i++) {
    if (i !== heightIdx) remainingSpans.push(bestMeasure.spans[i]);
  }

  const height = bestMeasure.spans[heightIdx];
  const length = Math.max(remainingSpans[0], remainingSpans[1]);
  const width = Math.min(remainingSpans[0], remainingSpans[1]);
  const geomLength = Math.max(length, width, height);

  return {
    geomLength,
    geomArea: totalArea,
    geomVolume: Math.abs(signedVolume),
    dimensions: {
      length,
      width,
      height,
    },
  };
}

function buildMetricSummary(
  entries: ElementMeasurementEntry[],
  ifcGetter: (entry: ElementMeasurementEntry) => number | null,
  geomGetter: (entry: ElementMeasurementEntry) => number | null,
  effectiveGetter: (entry: ElementMeasurementEntry) => number | null,
): MetricSummary {
  let total = 0;
  let ifcTotal = 0;
  let ifcCount = 0;
  let geometryTotal = 0;
  let geometryCount = 0;

  for (const entry of entries) {
    const ifcVal = ifcGetter(entry);
    const geomVal = geomGetter(entry);
    const effVal = effectiveGetter(entry);

    if (ifcVal !== null) {
      ifcTotal += ifcVal;
      ifcCount++;
    }
    if (geomVal !== null) {
      geometryTotal += geomVal;
      geometryCount++;
    }
    if (effVal !== null) {
      total += effVal;
    }
  }

  let source: MeasurementSource = 'none';
  if (ifcCount > 0 && ifcCount === entries.length) {
    source = 'ifc';
  } else if (ifcCount > 0 && geometryCount > 0) {
    source = 'mixed';
  } else if (ifcCount > 0) {
    source = 'ifc';
  } else if (geometryCount > 0) {
    source = 'geometry';
  }

  return {
    total,
    ifcTotal,
    ifcCount,
    geometryTotal,
    geometryCount,
    source,
  };
}

export async function computeSelectionMeasurements(
  fragments: OBC.FragmentsManager,
  selectedElementsMap: Record<string, number[]>,
  modelNamesById: Record<string, string>,
  isCancelled?: () => boolean,
): Promise<SelectionMeasurementsResult | null> {
  const modelEntries = Object.entries(selectedElementsMap).filter(
    ([, ids]) => ids.length > 0,
  );
  const totalCount = modelEntries.reduce((sum, [, ids]) => sum + ids.length, 0);

  if (totalCount === 0) {
    return null;
  }

  const useDetailedGeometry = totalCount <= MAX_DETAILED_GEOMETRY_ITEMS;
  const elements: ElementMeasurementEntry[] = [];
  const mergedSelectionBox = new THREE.Box3();
  const boxSize = new THREE.Vector3();

  for (const [modelId, rawIds] of modelEntries) {
    if (isCancelled?.()) return null;

    const model = fragments.list.get(modelId);
    if (!model) continue;

    const modelName = modelNamesById[modelId] || modelId;
    const localIds = Array.from(new Set(rawIds));

    // 1. Collect metadata and IFC quantities
    const ifcMetaMap = new Map<
      number,
      { name: string; category: string; quantities: ExtractedIfcQuantities }
    >();

    for (let i = 0; i < localIds.length; i += DATA_CHUNK_SIZE) {
      if (isCancelled?.()) return null;
      const chunkIds = localIds.slice(i, i + DATA_CHUNK_SIZE);

      try {
        const itemsData = await model.getItemsData(chunkIds, {
          attributesDefault: true,
          relations: {
            IsDefinedBy: { attributes: true, relations: true },
          },
        });

        for (let j = 0; j < chunkIds.length; j++) {
          const fallbackId = chunkIds[j];
          const item = itemsData[j];
          if (!item) continue;

          const parsedId = readAttrNumber(item._localId);
          const resolvedId =
            parsedId !== null && Number.isFinite(parsedId)
              ? parsedId
              : fallbackId;
          const category =
            readAttrString(item._category) || 'Sin categoría';
          const name =
            readAttrString(item.Name) ||
            readAttrString(item.Tag) ||
            `${category} #${resolvedId}`;
          const quantities = extractIfcQuantities(item);

          ifcMetaMap.set(resolvedId, { name, category, quantities });
        }
      } catch (err) {
        console.warn(
          `[selectionMeasurements] Could not read IFC quantities for ${modelName}:`,
          err,
        );
      }
    }

    // 2. Collect bounding boxes for fast overall bounds & large-selection fallback
    const boxMetricsMap = new Map<
      number,
      { length: number; width: number; height: number }
    >();

    for (let i = 0; i < localIds.length; i += BOX_CHUNK_SIZE) {
      if (isCancelled?.()) return null;
      const chunkIds = localIds.slice(i, i + BOX_CHUNK_SIZE);
      try {
        const boxes = await model.getBoxes(chunkIds);
        for (let j = 0; j < chunkIds.length; j++) {
          const box = boxes[j];
          if (!box || box.isEmpty()) continue;
          mergedSelectionBox.union(box);
          box.getSize(boxSize);
          const length = Math.max(boxSize.x, boxSize.z);
          const width = Math.min(boxSize.x, boxSize.z);
          const height = boxSize.y;
          boxMetricsMap.set(chunkIds[j], { length, width, height });
        }
      } catch (err) {
        console.warn(
          `[selectionMeasurements] Could not read bounding boxes for ${modelName}:`,
          err,
        );
      }
    }

    // 3. Collect detailed 3D mesh surface area, volume and oriented dimensions
    const meshMetricsMap = new Map<number, ComputedMeshMetrics>();
    let modelFallbackVolume: number | null = null;

    if (useDetailedGeometry) {
      for (let i = 0; i < localIds.length; i += GEOM_CHUNK_SIZE) {
        if (isCancelled?.()) return null;
        const chunkIds = localIds.slice(i, i + GEOM_CHUNK_SIZE);
        try {
          const geomArrays = await model.getItemsGeometry(chunkIds);
          for (let j = 0; j < chunkIds.length; j++) {
            const metrics = computeMeshMetrics(geomArrays[j] || []);
            if (metrics) {
              meshMetricsMap.set(chunkIds[j], metrics);
            }
          }
        } catch (err) {
          console.warn(
            `[selectionMeasurements] Could not compute 3D geometry metrics for ${modelName}:`,
            err,
          );
        }
      }
    } else {
      try {
        const vol = await model.getItemsVolume(localIds);
        if (Number.isFinite(vol)) {
          modelFallbackVolume = Math.abs(vol);
        }
      } catch (err) {
        console.warn(
          `[selectionMeasurements] Could not compute aggregate volume for ${modelName}:`,
          err,
        );
      }
    }

    let fallbackVolumeAssigned = false;

    for (const localId of localIds) {
      const meta = ifcMetaMap.get(localId);
      const meshMetrics = meshMetricsMap.get(localId);
      const boxMetrics = boxMetricsMap.get(localId);

      const category = meta?.category || 'Sin categoría';
      const name = meta?.name || `#${localId}`;
      const ifcLength = meta?.quantities.length ?? null;
      const ifcArea = meta?.quantities.area ?? null;
      const ifcVolume = meta?.quantities.volume ?? null;

      const geomLength =
        meshMetrics?.geomLength ??
        (boxMetrics
          ? Math.max(boxMetrics.length, boxMetrics.height)
          : null);
      const geomArea = meshMetrics?.geomArea ?? null;

      let geomVolume: number | null = meshMetrics?.geomVolume ?? null;
      if (geomVolume === null && !useDetailedGeometry && !fallbackVolumeAssigned) {
        geomVolume = modelFallbackVolume;
        fallbackVolumeAssigned = true;
      }

      const dimensions = meshMetrics?.dimensions ?? boxMetrics ?? null;

      elements.push({
        modelId,
        modelName,
        localId,
        name,
        category,
        ifcLength,
        ifcArea,
        ifcVolume,
        geomLength,
        geomArea,
        geomVolume,
        effectiveLength: ifcLength ?? geomLength,
        effectiveArea: ifcArea ?? geomArea,
        effectiveVolume: ifcVolume ?? geomVolume,
        dimensions,
      });
    }
  }

  if (isCancelled?.()) return null;

  // Category aggregation
  const categoryMap = new Map<string, CategoryMeasurementSummary>();
  for (const el of elements) {
    const existing = categoryMap.get(el.category);
    if (existing) {
      existing.count += 1;
      existing.lengthTotal += el.effectiveLength ?? 0;
      existing.areaTotal += el.effectiveArea ?? 0;
      existing.volumeTotal += el.effectiveVolume ?? 0;
    } else {
      categoryMap.set(el.category, {
        category: el.category,
        count: 1,
        lengthTotal: el.effectiveLength ?? 0,
        areaTotal: el.effectiveArea ?? 0,
        volumeTotal: el.effectiveVolume ?? 0,
      });
    }
  }

  const categories = Array.from(categoryMap.values()).sort(
    (a, b) => b.count - a.count || a.category.localeCompare(b.category),
  );

  let boundingDimensions: { length: number; width: number; height: number } | null =
    null;
  if (!mergedSelectionBox.isEmpty()) {
    mergedSelectionBox.getSize(boxSize);
    boundingDimensions = {
      length: Math.max(boxSize.x, boxSize.z),
      width: Math.min(boxSize.x, boxSize.z),
      height: boxSize.y,
    };
  }

  return {
    totalCount: elements.length,
    modelCount: modelEntries.length,
    length: buildMetricSummary(
      elements,
      (e) => e.ifcLength,
      (e) => e.geomLength,
      (e) => e.effectiveLength,
    ),
    area: buildMetricSummary(
      elements,
      (e) => e.ifcArea,
      (e) => e.geomArea,
      (e) => e.effectiveArea,
    ),
    volume: buildMetricSummary(
      elements,
      (e) => e.ifcVolume,
      (e) => e.geomVolume,
      (e) => e.effectiveVolume,
    ),
    boundingDimensions,
    categories,
    elements,
    geometrySurfaceSkipped: !useDetailedGeometry,
  };
}

