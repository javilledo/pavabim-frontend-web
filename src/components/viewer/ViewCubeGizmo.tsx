import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useEngine } from '../../viewer/EngineContext';

type CardinalDirection = 'N' | 'S' | 'E' | 'O';

interface CubePieceMeta {
  kind: 'face' | 'edge' | 'corner';
  dir: [number, number, number];
  label: string;
  faceIndex?: number;
  normalMat: THREE.Material;
}

interface CardinalPieceMeta {
  kind: 'cardinal';
  cardinal: CardinalDirection;
  label: string;
  normalMat: THREE.Material;
  hoverMat: THREE.Material;
}

type GizmoPickMeta = CubePieceMeta | CardinalPieceMeta;

interface FaceConfig {
  dir: [number, number, number];
  label: string;
  shortLabel: string;
  rotation: [number, number, number];
}

interface CardinalConfig {
  cardinal: CardinalDirection;
  label: string;
  position: [number, number, number];
  isNorth?: boolean;
}

const GIZMO_SIZE_PX = 164;
const CUBE_HALF = 0.88;
const CENTER_HALF = 0.54;
const EDGE_THICK = CUBE_HALF - CENTER_HALF;
const CENTER_SPAN = CENTER_HALF * 2;
const EDGE_OFFSET = CENTER_HALF + EDGE_THICK * 0.5;
const COMPASS_Y = -CUBE_HALF - 0.10;
const CARDINAL_RADIUS = 1.24;

const FACES: FaceConfig[] = [
  {
    dir: [0, 1, 0],
    label: 'Superior (Planta)',
    shortLabel: 'SUP.',
    rotation: [-Math.PI / 2, 0, 0],
  },
  {
    dir: [0, -1, 0],
    label: 'Inferior',
    shortLabel: 'INF.',
    rotation: [Math.PI / 2, 0, 0],
  },
  {
    dir: [0, 0, 1],
    label: 'Frontal',
    shortLabel: 'FRONTAL',
    rotation: [0, 0, 0],
  },
  {
    dir: [0, 0, -1],
    label: 'Posterior',
    shortLabel: 'POST.',
    rotation: [0, Math.PI, 0],
  },
  {
    dir: [1, 0, 0],
    label: 'Derecha',
    shortLabel: 'DER.',
    rotation: [0, Math.PI / 2, 0],
  },
  {
    dir: [-1, 0, 0],
    label: 'Izquierda',
    shortLabel: 'IZQ.',
    rotation: [0, -Math.PI / 2, 0],
  },
];

const CARDINALS: CardinalConfig[] = [
  {
    cardinal: 'N',
    label: 'Planta hacia Norte',
    position: [0, COMPASS_Y, -CARDINAL_RADIUS],
    isNorth: true,
  },
  {
    cardinal: 'S',
    label: 'Planta hacia Sur',
    position: [0, COMPASS_Y, CARDINAL_RADIUS],
  },
  {
    cardinal: 'E',
    label: 'Planta hacia Este',
    position: [CARDINAL_RADIUS, COMPASS_Y, 0],
  },
  {
    cardinal: 'O',
    label: 'Planta hacia Oeste',
    position: [-CARDINAL_RADIUS, COMPASS_Y, 0],
  },
];

const DEFAULT_TOOLTIP =
  'Cubo de vistas (clic en cara, arista, vértice o N/S/E/O · arrastra para girar)';

function buildPieceLabel(ix: number, iy: number, iz: number): string {
  const parts: string[] = [];
  if (iy === 1) parts.push('Superior');
  if (iy === -1) parts.push('Inferior');
  if (iz === 1) parts.push('Frontal');
  if (iz === -1) parts.push('Posterior');
  if (ix === 1) parts.push('Derecha');
  if (ix === -1) parts.push('Izquierda');
  if (parts.length === 1 && iy === 1) return 'Superior (Planta)';
  return parts.join(' / ');
}

function createFaceLabelTexture(text: string, hovered: boolean): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = hovered ? '#facc15' : '#272a30';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = hovered ? '#fef08a' : '#4b5563';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, size - 8, size - 8);

    ctx.fillStyle = hovered ? '#18191c' : '#e5e7eb';
    ctx.font = '700 44px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2 + 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createCompassTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Outer subtle ring
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 206, 0, Math.PI * 2);
    ctx.stroke();

    // Tick marks around perimeter
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 3;
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg * Math.PI) / 180;
      const rIn = deg % 90 === 0 ? 186 : 196;
      const rOut = 212;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * rIn, cy + Math.sin(rad) * rIn);
      ctx.lineTo(cx + Math.cos(rad) * rOut, cy + Math.sin(rad) * rOut);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createCardinalBadgeTexture(
  letter: CardinalDirection,
  isNorth: boolean,
  hovered: boolean
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    const radius = 52;

    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = hovered ? '#facc15' : 'rgba(24, 25, 28, 0.92)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hovered
      ? '#fef08a'
      : isNorth
        ? '#facc15'
        : 'rgba(148, 163, 184, 0.72)';
    ctx.lineWidth = isNorth || hovered ? 8 : 6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '800 56px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hovered ? '#18191c' : isNorth ? '#facc15' : '#e5e7eb';
    ctx.fillText(letter, cx, cy + 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export const ViewCubeGizmo: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const {
    isEngineReady,
    world,
    setCameraViewFromDirection,
    setPlanViewOrientation,
  } = useEngine();

  const setCameraViewFromDirectionRef = useRef(setCameraViewFromDirection);
  setCameraViewFromDirectionRef.current = setCameraViewFromDirection;

  const setPlanViewOrientationRef = useRef(setPlanViewOrientation);
  setPlanViewOrientationRef.current = setPlanViewOrientation;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!isEngineReady || !world || !canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(GIZMO_SIZE_PX, GIZMO_SIZE_PX, false);

    const scene = new THREE.Scene();
    const viewExtent = 1.82;
    const cubeCamera = new THREE.OrthographicCamera(
      -viewExtent,
      viewExtent,
      viewExtent,
      -viewExtent,
      0.1,
      20
    );

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.75);
    keyLight.position.set(3, 5, 4);
    const fillLight = new THREE.DirectionalLight(0xcbd5e1, 0.45);
    fillLight.position.set(-4, -3, -2);
    scene.add(ambientLight, keyLight, fillLight);

    const cubeGroup = new THREE.Group();
    scene.add(cubeGroup);

    const pickMeshes: THREE.Mesh[] = [];
    const disposables: Array<{ dispose: () => void }> = [];

    const matEdgeNormal = new THREE.MeshStandardMaterial({
      color: 0x32363f,
      roughness: 0.75,
      metalness: 0.1,
    });
    const matCornerNormal = new THREE.MeshStandardMaterial({
      color: 0x3b404b,
      roughness: 0.7,
      metalness: 0.12,
    });
    const matFaceBaseNormal = new THREE.MeshStandardMaterial({
      color: 0x272a30,
      roughness: 0.8,
      metalness: 0.05,
    });
    const matHoverAccent = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0x713f12,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.1,
    });
    disposables.push(matEdgeNormal, matCornerNormal, matFaceBaseNormal, matHoverAccent);

    const faceOverlays: Array<{
      mesh: THREE.Mesh;
      normalMat: THREE.MeshBasicMaterial;
      hoverMat: THREE.MeshBasicMaterial;
    }> = [];

    for (let idx = 0; idx < FACES.length; idx++) {
      const face = FACES[idx];
      const texNormal = createFaceLabelTexture(face.shortLabel, false);
      const texHover = createFaceLabelTexture(face.shortLabel, true);
      const normalMat = new THREE.MeshBasicMaterial({ map: texNormal });
      const hoverMat = new THREE.MeshBasicMaterial({ map: texHover });
      const geo = new THREE.PlaneGeometry(CENTER_SPAN, CENTER_SPAN);
      const planeMesh = new THREE.Mesh(geo, normalMat);
      planeMesh.position.set(
        face.dir[0] * (CUBE_HALF + 0.003),
        face.dir[1] * (CUBE_HALF + 0.003),
        face.dir[2] * (CUBE_HALF + 0.003)
      );
      planeMesh.rotation.set(face.rotation[0], face.rotation[1], face.rotation[2]);
      planeMesh.raycast = () => {};
      cubeGroup.add(planeMesh);

      faceOverlays[idx] = { mesh: planeMesh, normalMat, hoverMat };
      disposables.push(texNormal, texHover, normalMat, hoverMat, geo);
    }

    const faceIndexByDirKey = new Map<string, number>();
    FACES.forEach((f, idx) => {
      faceIndexByDirKey.set(`${f.dir[0]},${f.dir[1]},${f.dir[2]}`, idx);
    });

    const axisCoord = (i: number) => (i === 0 ? 0 : i * EDGE_OFFSET);
    const axisSize = (i: number) => (i === 0 ? CENTER_SPAN : EDGE_THICK);

    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = -1; iy <= 1; iy++) {
        for (let iz = -1; iz <= 1; iz++) {
          if (ix === 0 && iy === 0 && iz === 0) continue;

          const nonZeroCount =
            (ix !== 0 ? 1 : 0) + (iy !== 0 ? 1 : 0) + (iz !== 0 ? 1 : 0);
          const kind: CubePieceMeta['kind'] =
            nonZeroCount === 1 ? 'face' : nonZeroCount === 2 ? 'edge' : 'corner';
          const faceIndex =
            kind === 'face' ? faceIndexByDirKey.get(`${ix},${iy},${iz}`) : undefined;

          const geo = new THREE.BoxGeometry(axisSize(ix), axisSize(iy), axisSize(iz));
          const normalMat =
            kind === 'face'
              ? matFaceBaseNormal
              : kind === 'edge'
                ? matEdgeNormal
                : matCornerNormal;
          const mesh = new THREE.Mesh(geo, normalMat);
          mesh.position.set(axisCoord(ix), axisCoord(iy), axisCoord(iz));

          const meta: CubePieceMeta = {
            dir: [ix, iy, iz],
            label: buildPieceLabel(ix, iy, iz),
            kind,
            faceIndex,
            normalMat,
          };
          mesh.userData = meta;

          cubeGroup.add(mesh);
          pickMeshes.push(mesh);
          disposables.push(geo);
        }
      }
    }

    // Crisp outer cube wireframe + face subdivision lines (non-raycastable)
    const outerBoxGeo = new THREE.BoxGeometry(CUBE_HALF * 2, CUBE_HALF * 2, CUBE_HALF * 2);
    const outerEdgesGeo = new THREE.EdgesGeometry(outerBoxGeo);
    const outerEdgesMat = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.75,
    });
    const outerLines = new THREE.LineSegments(outerEdgesGeo, outerEdgesMat);
    outerLines.raycast = () => {};
    cubeGroup.add(outerLines);
    outerBoxGeo.dispose();
    disposables.push(outerEdgesGeo, outerEdgesMat);

    // Subdivision grid lines on each cube face separating faces, edges, and corners
    const gridVerts: number[] = [];
    const S = CUBE_HALF + 0.002;
    const B = CENTER_HALF;
    const pushLine = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
      gridVerts.push(x1, y1, z1, x2, y2, z2);
    };
    for (const sign of [-1, 1]) {
      // ±X faces
      pushLine(sign * S, -S, -B, sign * S, S, -B);
      pushLine(sign * S, -S, B, sign * S, S, B);
      pushLine(sign * S, -B, -S, sign * S, -B, S);
      pushLine(sign * S, B, -S, sign * S, B, S);
      // ±Y faces
      pushLine(-S, sign * S, -B, S, sign * S, -B);
      pushLine(-S, sign * S, B, S, sign * S, B);
      pushLine(-B, sign * S, -S, -B, sign * S, S);
      pushLine(B, sign * S, -S, B, sign * S, S);
      // ±Z faces
      pushLine(-B, -S, sign * S, -B, S, sign * S);
      pushLine(B, -S, sign * S, B, S, sign * S);
      pushLine(-S, -B, sign * S, S, -B, sign * S);
      pushLine(-S, B, sign * S, S, B, sign * S);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridVerts, 3));
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.48,
    });
    const gridLines = new THREE.LineSegments(gridGeo, gridMat);
    gridLines.raycast = () => {};
    cubeGroup.add(gridLines);
    disposables.push(gridGeo, gridMat);

    // Compass ring at base (non-raycastable background ring)
    const compassTex = createCompassTexture();
    const compassMat = new THREE.MeshBasicMaterial({
      map: compassTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const compassGeo = new THREE.PlaneGeometry(2.8, 2.8);
    const compassMesh = new THREE.Mesh(compassGeo, compassMat);
    compassMesh.rotation.x = -Math.PI / 2;
    compassMesh.position.y = COMPASS_Y - 0.01;
    compassMesh.raycast = () => {};
    scene.add(compassMesh);
    disposables.push(compassTex, compassMat, compassGeo);

    // 4 Interactive cardinal buttons (N / S / E / O) on compass ring
    const cardinalMeshes: THREE.Mesh[] = [];
    const cardinalBadgeGeo = new THREE.PlaneGeometry(0.44, 0.44);
    disposables.push(cardinalBadgeGeo);

    for (const cfg of CARDINALS) {
      const texNormal = createCardinalBadgeTexture(
        cfg.cardinal,
        Boolean(cfg.isNorth),
        false
      );
      const texHover = createCardinalBadgeTexture(
        cfg.cardinal,
        Boolean(cfg.isNorth),
        true
      );
      const normalMat = new THREE.MeshBasicMaterial({
        map: texNormal,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const hoverMat = new THREE.MeshBasicMaterial({
        map: texHover,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const badgeMesh = new THREE.Mesh(cardinalBadgeGeo, normalMat);
      badgeMesh.position.set(cfg.position[0], cfg.position[1], cfg.position[2]);
      badgeMesh.rotation.x = -Math.PI / 2;
      badgeMesh.renderOrder = 2;

      const meta: CardinalPieceMeta = {
        kind: 'cardinal',
        cardinal: cfg.cardinal,
        label: cfg.label,
        normalMat,
        hoverMat,
      };
      badgeMesh.userData = meta;

      scene.add(badgeMesh);
      cardinalMeshes.push(badgeMesh);
      pickMeshes.push(badgeMesh);
      disposables.push(texNormal, texHover, normalMat, hoverMat);
    }

    const camRightVec = new THREE.Vector3();

    const renderCube = () => {
      const mainCam = world.camera.three;
      cubeCamera.quaternion.copy(mainCam.quaternion);
      cubeCamera.position.set(0, 0, 6).applyQuaternion(mainCam.quaternion);
      cubeCamera.updateMatrixWorld();

      // Keep top face ("SUP.") and cardinal badges ("N", "S", "E", "O") upright relative to screen right
      camRightVec.set(1, 0, 0).applyQuaternion(mainCam.quaternion);
      const uprightAngle = -Math.atan2(camRightVec.z, camRightVec.x);
      faceOverlays[0].mesh.rotation.z = uprightAngle;
      for (const badge of cardinalMeshes) {
        badge.rotation.z = uprightAngle;
      }

      renderer.render(scene, cubeCamera);
    };

    renderCube();

    const controls = world.camera.controls;
    controls.addEventListener('update', renderCube);
    world.camera.projection.onChanged.add(renderCube);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let hoveredMesh: THREE.Mesh | null = null;
    let isPointerDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;

    canvas.title = DEFAULT_TOOLTIP;

    const applyHoverMesh = (nextMesh: THREE.Mesh | null) => {
      if (hoveredMesh === nextMesh) return;

      if (hoveredMesh) {
        const prevMeta = hoveredMesh.userData as GizmoPickMeta;
        hoveredMesh.material = prevMeta.normalMat;
        if (prevMeta.kind === 'face' && prevMeta.faceIndex !== undefined) {
          const overlay = faceOverlays[prevMeta.faceIndex];
          overlay.mesh.material = overlay.normalMat;
        }
      }

      hoveredMesh = nextMesh;

      if (hoveredMesh) {
        const nextMeta = hoveredMesh.userData as GizmoPickMeta;
        if (nextMeta.kind === 'cardinal') {
          hoveredMesh.material = nextMeta.hoverMat;
          canvas.title = `${nextMeta.label} (clic para orientar la Planta)`;
        } else {
          hoveredMesh.material = matHoverAccent;
          if (nextMeta.faceIndex !== undefined) {
            const overlay = faceOverlays[nextMeta.faceIndex];
            overlay.mesh.material = overlay.hoverMat;
          }
          canvas.title = `Vista ${nextMeta.label} (clic para orientar · arrastra para girar)`;
        }
      } else {
        canvas.title = DEFAULT_TOOLTIP;
      }

      renderCube();
    };

    const pickPieceAtPointer = (clientX: number, clientY: number): THREE.Mesh | null => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, cubeCamera);
      const hits = raycaster.intersectObjects(pickMeshes, false);
      return hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      isPointerDown = true;
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture errors
      }
      applyHoverMesh(pickPieceAtPointer(e.clientX, e.clientY));
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (isPointerDown) {
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (!isDragging && dist > 4) {
          isDragging = true;
          applyHoverMesh(null);
        }
        if (isDragging && world.camera.hasCameraControls() && controls.enabled) {
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
          void controls.rotate(-dx * 0.012, -dy * 0.012, false);
          return;
        }
        lastX = e.clientX;
        lastY = e.clientY;
      }

      if (!isDragging) {
        applyHoverMesh(pickPieceAtPointer(e.clientX, e.clientY));
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isPointerDown || e.button !== 0) return;
      e.stopPropagation();
      isPointerDown = false;
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore capture release errors
      }

      if (!isDragging) {
        const target = pickPieceAtPointer(e.clientX, e.clientY);
        if (target) {
          const meta = target.userData as GizmoPickMeta;
          if (meta.kind === 'cardinal') {
            void setPlanViewOrientationRef.current(meta.cardinal);
          } else {
            const [dx, dy, dz] = meta.dir;
            void setCameraViewFromDirectionRef.current(dx, dy, dz);
          }
        }
      }
      isDragging = false;
    };

    const handlePointerCancel = () => {
      isPointerDown = false;
      isDragging = false;
      applyHoverMesh(null);
    };

    const handlePointerLeave = () => {
      if (!isPointerDown) {
        applyHoverMesh(null);
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      controls.removeEventListener('update', renderCube);
      world.camera.projection.onChanged.remove(renderCube);
      for (const item of disposables) {
        item.dispose();
      }
      renderer.dispose();
    };
  }, [isEngineReady, world]);

  if (!isEngineReady) return null;

  return (
    <div className="absolute top-3 right-3 z-20 w-[164px] h-[164px] select-none pointer-events-none">
      <canvas
        ref={canvasRef}
        width={GIZMO_SIZE_PX}
        height={GIZMO_SIZE_PX}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-full pointer-events-auto cursor-pointer drop-shadow-[0_4px_12px_rgba(0,0,0,0.55)]"
      />
    </div>
  );
};

export default ViewCubeGizmo;
