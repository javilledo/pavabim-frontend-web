import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useLocalFragUpload } from '../hooks/useLocalFragUpload';
import { useViewerStore } from '../store/useViewerStore';
import { computeMeasurementBetweenTargets } from '../utils/measureGeometry';
import { formatCoordinateEs, formatDecimalEs } from '../utils/numberFormat';
import {
  type AreaFaceMeasurement,
  type MeasureSnapTarget,
  type PickedCoordinateResult,
  type SurfaceFaceHit,
  type VolumeElementMeasurement,
  useEngine,
} from './EngineContext';

interface FaceContextMenuState {
  x: number;
  y: number;
  faceHit: SurfaceFaceHit | null;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const formatCoordinate = (value: number): string => formatCoordinateEs(value, 3);

export const ViewerCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const rightPointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const leftPointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const contextMenuReqIdRef = useRef(0);
  const coordPickReqIdRef = useRef(0);
  const measurePickReqIdRef = useRef(0);
  const hoverPickInFlightRef = useRef(false);
  const lastHoverCheckTsRef = useRef(0);
  const {
    isEngineReady,
    world,
    initEngine,
    disposeEngine,
    clearSelection,
    hideSelectedElements,
    pickFaceAtClientPoint,
    pickCoordinateAtClientPoint,
    pickMeasureTargetAtClientPoint,
    updateMeasureOverlay,
    commitMeasurement,
    removeLastMeasurement,
    clearMeasurements,
    measurementCount,
    pickAreaFaceAtClientPoint,
    updateAreaMeasureOverlay,
    pickVolumeElementAtClientPoint,
    updateVolumeMeasureOverlay,
    createSectionFromFace,
    lookPerpendicularToFace,
    clearSections,
    clipper,
  } = useEngine();
  const {
    activeTool,
    measureMode,
    isSectionActive,
    loadedModels,
    isLoadingModel,
    loadingModelName,
    viewerToastError,
    selectedElementsMap,
    setActiveTool,
    setViewerToastError,
  } = useViewerStore();
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const measureModeRef = useRef(measureMode);
  measureModeRef.current = measureMode;
  const { loadLocalFragFiles } = useLocalFragUpload();
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [faceContextMenu, setFaceContextMenu] =
    useState<FaceContextMenuState | null>(null);
  const [pickedCoordinate, setPickedCoordinate] =
    useState<PickedCoordinateResult | null>(null);
  const [hoverCoordinate, setHoverCoordinate] =
    useState<PickedCoordinateResult | null>(null);
  const [pinnedScreenPos, setPinnedScreenPos] = useState<ScreenPoint | null>(null);
  const [hoverScreenPos, setHoverScreenPos] = useState<ScreenPoint | null>(null);
  const [copiedCoordinateText, setCopiedCoordinateText] = useState(false);
  const [anchorMeasureTarget, setAnchorMeasureTarget] =
    useState<MeasureSnapTarget | null>(null);
  const [hoverMeasureTarget, setHoverMeasureTarget] =
    useState<MeasureSnapTarget | null>(null);
  const [anchorMeasureScreenPos, setAnchorMeasureScreenPos] =
    useState<ScreenPoint | null>(null);
  const [hoverMeasureScreenPos, setHoverMeasureScreenPos] =
    useState<ScreenPoint | null>(null);
  const anchorMeasureTargetRef = useRef(anchorMeasureTarget);
  anchorMeasureTargetRef.current = anchorMeasureTarget;
  const [areaItems, setAreaItems] = useState<AreaFaceMeasurement[]>([]);
  const [hoverAreaFace, setHoverAreaFace] =
    useState<AreaFaceMeasurement | null>(null);
  const [volumeItems, setVolumeItems] = useState<VolumeElementMeasurement[]>([]);
  const [hoverVolumeElement, setHoverVolumeElement] =
    useState<VolumeElementMeasurement | null>(null);

  const totalArea = useMemo(
    () => areaItems.reduce((sum, item) => sum + item.area, 0),
    [areaItems]
  );
  const totalVolume = useMemo(
    () => volumeItems.reduce((sum, item) => sum + item.volume, 0),
    [volumeItems]
  );

  const handleClearAllMeasurements = useCallback(() => {
    clearMeasurements();
    measurePickReqIdRef.current++;
    setAnchorMeasureTarget(null);
    setHoverMeasureTarget(null);
    setAreaItems([]);
    setHoverAreaFace(null);
    setVolumeItems([]);
    setHoverVolumeElement(null);
  }, [clearMeasurements]);

  const handleUndoMeasurement = useCallback(() => {
    if (measureMode === 'area') {
      setAreaItems((prev) => prev.slice(0, -1));
      return;
    }
    if (measureMode === 'volume') {
      setVolumeItems((prev) => prev.slice(0, -1));
      return;
    }
    if (anchorMeasureTargetRef.current) {
      measurePickReqIdRef.current++;
      setAnchorMeasureTarget(null);
    } else {
      removeLastMeasurement();
    }
  }, [measureMode, removeLastMeasurement]);

  const previewMeasurement = useMemo(
    () =>
      anchorMeasureTarget && hoverMeasureTarget
        ? computeMeasurementBetweenTargets(anchorMeasureTarget, hoverMeasureTarget)
        : null,
    [anchorMeasureTarget, hoverMeasureTarget]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    initEngine(container);

    return () => {
      disposeEngine();
    };
  }, [initEngine, disposeEngine]);

  // Keyboard shortcuts (Escape clears selection; Space hides selected elements)
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable ||
        target.getAttribute('role') === 'textbox'
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (faceContextMenu) {
          setFaceContextMenu(null);
          return;
        }
        if (activeTool === 'measure' && anchorMeasureTargetRef.current) {
          measurePickReqIdRef.current++;
          setAnchorMeasureTarget(null);
          return;
        }
        if (activeTool === 'coordinates' || pickedCoordinate) {
          setHoverCoordinate(null);
          setPickedCoordinate(null);
        }
        clearSelection();
        setActiveTool('select');
        return;
      }

      if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        activeTool === 'measure' &&
        isEngineReady &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault();
        handleUndoMeasurement();
        return;
      }

      if (
        (e.code === 'Space' || e.key === ' ') &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        isEngineReady &&
        !isEditableTarget(e.target)
      ) {
        const hasSelection = Object.values(selectedElementsMap).some(
          (ids) => ids.length > 0,
        );
        if (!hasSelection) return;
        e.preventDefault();
        void hideSelectedElements();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTool,
    clearSelection,
    faceContextMenu,
    handleUndoMeasurement,
    hideSelectedElements,
    isEngineReady,
    pickedCoordinate,
    selectedElementsMap,
    setActiveTool,
  ]);

  useEffect(() => {
    if (!faceContextMenu) return;

    const closeMenu = () => setFaceContextMenu(null);
    const handlePointerDown = (e: PointerEvent) => {
      if (
        contextMenuRef.current &&
        e.target instanceof Node &&
        contextMenuRef.current.contains(e.target)
      ) {
        return;
      }
      setFaceContextMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('wheel', closeMenu, { passive: true });
    window.addEventListener('resize', closeMenu);
    window.addEventListener('blur', closeMenu);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('wheel', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('blur', closeMenu);
    };
  }, [faceContextMenu]);

  useEffect(() => {
    if (!viewerToastError) return;
    const timer = window.setTimeout(() => setViewerToastError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [viewerToastError, setViewerToastError]);

  useEffect(() => {
    if (activeTool !== 'coordinates') {
      coordPickReqIdRef.current++;
      setHoverCoordinate(null);
      setHoverScreenPos(null);
    }
    if (activeTool !== 'measure' || measureMode !== 'length') {
      setAnchorMeasureTarget(null);
      setHoverMeasureTarget(null);
      setAnchorMeasureScreenPos(null);
      setHoverMeasureScreenPos(null);
    }
    if (activeTool !== 'measure' || measureMode !== 'area') {
      setHoverAreaFace(null);
    }
    if (activeTool !== 'measure' || measureMode !== 'volume') {
      setHoverVolumeElement(null);
    }
    if (activeTool !== 'measure') {
      measurePickReqIdRef.current++;
    }
    if (activeTool !== 'coordinates' && activeTool !== 'measure') {
      leftPointerDownRef.current = null;
    }
  }, [activeTool, measureMode]);

  useEffect(() => {
    if (!isEngineReady) return;
    if (activeTool !== 'measure' || measureMode !== 'length') {
      updateMeasureOverlay(null);
      return;
    }
    updateMeasureOverlay({
      hover: hoverMeasureTarget,
      anchor: anchorMeasureTarget,
      preview: previewMeasurement,
    });
  }, [
    activeTool,
    measureMode,
    isEngineReady,
    hoverMeasureTarget,
    anchorMeasureTarget,
    previewMeasurement,
    updateMeasureOverlay,
  ]);

  useEffect(() => {
    if (!isEngineReady) return;
    const activeHover =
      activeTool === 'measure' && measureMode === 'area' ? hoverAreaFace : null;
    updateAreaMeasureOverlay(areaItems, activeHover);
  }, [activeTool, measureMode, isEngineReady, areaItems, hoverAreaFace, updateAreaMeasureOverlay]);

  useEffect(() => {
    if (!isEngineReady) return;
    const activeHover =
      activeTool === 'measure' && measureMode === 'volume'
        ? hoverVolumeElement
        : null;
    void updateVolumeMeasureOverlay(volumeItems, activeHover);
  }, [
    activeTool,
    measureMode,
    isEngineReady,
    volumeItems,
    hoverVolumeElement,
    updateVolumeMeasureOverlay,
  ]);

  useEffect(() => {
    if (loadedModels.length === 0) {
      setPickedCoordinate(null);
      setHoverCoordinate(null);
      setAnchorMeasureTarget(null);
      setHoverMeasureTarget(null);
      setAreaItems([]);
      setHoverAreaFace(null);
      setVolumeItems([]);
      setHoverVolumeElement(null);
    }
  }, [loadedModels.length]);

  useEffect(() => {
    if (!copiedCoordinateText) return;
    const timer = window.setTimeout(() => setCopiedCoordinateText(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedCoordinateText]);

  const projectWorldPoint = useCallback(
    (point: THREE.Vector3 | undefined | null): ScreenPoint | null => {
      const container = containerRef.current;
      const camera = world?.camera.three;
      if (!point || !container || !camera) return null;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const projected = point.clone().project(camera);
      if (projected.z < -1 || projected.z > 1) return null;

      return {
        x: (projected.x * 0.5 + 0.5) * rect.width,
        y: (-projected.y * 0.5 + 0.5) * rect.height,
      };
    },
    [world]
  );

  useEffect(() => {
    const syncProjectedPins = () => {
      setPinnedScreenPos(projectWorldPoint(pickedCoordinate?.point));
      setHoverScreenPos(projectWorldPoint(hoverCoordinate?.point));
      setAnchorMeasureScreenPos(projectWorldPoint(anchorMeasureTarget?.point));
      setHoverMeasureScreenPos(projectWorldPoint(hoverMeasureTarget?.point));
    };

    syncProjectedPins();

    if (
      !pickedCoordinate &&
      !hoverCoordinate &&
      !anchorMeasureTarget &&
      !hoverMeasureTarget
    ) {
      return;
    }

    const controls = world?.camera.controls;
    controls?.addEventListener('update', syncProjectedPins);
    window.addEventListener('resize', syncProjectedPins);
    return () => {
      controls?.removeEventListener('update', syncProjectedPins);
      window.removeEventListener('resize', syncProjectedPins);
    };
  }, [
    world,
    pickedCoordinate,
    hoverCoordinate,
    anchorMeasureTarget,
    hoverMeasureTarget,
    projectWorldPoint,
  ]);

  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) {
      rightPointerDownRef.current = { x: e.clientX, y: e.clientY };
    } else {
      rightPointerDownRef.current = null;
    }

    if (e.button === 0 && (activeTool === 'coordinates' || activeTool === 'measure')) {
      leftPointerDownRef.current = { x: e.clientX, y: e.clientY };
    } else {
      leftPointerDownRef.current = null;
    }
  };

  const handleViewportPointerMove = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      (activeTool !== 'coordinates' && activeTool !== 'measure') ||
      !isEngineReady ||
      e.buttons !== 0
    ) {
      return;
    }
    if (hoverPickInFlightRef.current) return;

    const now = performance.now();
    if (now - lastHoverCheckTsRef.current < 45) return;
    lastHoverCheckTsRef.current = now;
    hoverPickInFlightRef.current = true;

    try {
      if (activeTool === 'coordinates') {
        const hit = await pickCoordinateAtClientPoint(e.clientX, e.clientY);
        if (activeToolRef.current !== 'coordinates') return;
        setHoverCoordinate(hit);
      } else if (measureModeRef.current === 'area') {
        const face = await pickAreaFaceAtClientPoint(e.clientX, e.clientY);
        if (
          activeToolRef.current !== 'measure' ||
          measureModeRef.current !== 'area'
        ) {
          return;
        }
        setHoverAreaFace(face);
      } else if (measureModeRef.current === 'volume') {
        const vol = await pickVolumeElementAtClientPoint(e.clientX, e.clientY, {
          hoverOnly: true,
        });
        if (
          activeToolRef.current !== 'measure' ||
          measureModeRef.current !== 'volume'
        ) {
          return;
        }
        setHoverVolumeElement(vol);
      } else {
        const target = await pickMeasureTargetAtClientPoint(e.clientX, e.clientY);
        if (
          activeToolRef.current !== 'measure' ||
          measureModeRef.current !== 'length'
        ) {
          return;
        }
        setHoverMeasureTarget(target);
      }
    } finally {
      hoverPickInFlightRef.current = false;
    }
  };

  const handleViewportPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      e.button !== 0 ||
      (activeTool !== 'coordinates' && activeTool !== 'measure') ||
      !isEngineReady
    ) {
      return;
    }

    const downPos = leftPointerDownRef.current;
    leftPointerDownRef.current = null;
    if (!downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 4) {
      return;
    }

    if (activeTool === 'coordinates') {
      const reqId = ++coordPickReqIdRef.current;
      const hit = await pickCoordinateAtClientPoint(e.clientX, e.clientY);
      if (reqId !== coordPickReqIdRef.current || activeToolRef.current !== 'coordinates') {
        return;
      }

      if (hit) {
        setPickedCoordinate(hit);
        setCopiedCoordinateText(false);
      }
      return;
    }

    const isAdditive = e.ctrlKey || e.metaKey;
    const reqId = ++measurePickReqIdRef.current;
    const modeAtClick = measureModeRef.current;

    if (modeAtClick === 'area') {
      const face = await pickAreaFaceAtClientPoint(e.clientX, e.clientY);
      if (
        reqId !== measurePickReqIdRef.current ||
        activeToolRef.current !== 'measure' ||
        measureModeRef.current !== 'area'
      ) {
        return;
      }
      if (!face) return;

      setAreaItems((prev) => {
        if (!isAdditive) return [face];
        const exists = prev.some((item) => item.key === face.key);
        return exists
          ? prev.filter((item) => item.key !== face.key)
          : [...prev, face];
      });
      return;
    }

    if (modeAtClick === 'volume') {
      const item = await pickVolumeElementAtClientPoint(e.clientX, e.clientY);
      if (
        reqId !== measurePickReqIdRef.current ||
        activeToolRef.current !== 'measure' ||
        measureModeRef.current !== 'volume'
      ) {
        return;
      }
      if (!item) return;

      setVolumeItems((prev) => {
        if (!isAdditive) return [item];
        const exists = prev.some((v) => v.key === item.key);
        return exists ? prev.filter((v) => v.key !== item.key) : [...prev, item];
      });
      return;
    }

    const hit = await pickMeasureTargetAtClientPoint(e.clientX, e.clientY);
    if (
      reqId !== measurePickReqIdRef.current ||
      activeToolRef.current !== 'measure' ||
      measureModeRef.current !== 'length'
    ) {
      return;
    }

    if (!hit) return;

    if (!anchorMeasureTargetRef.current) {
      setAnchorMeasureTarget(hit);
    } else {
      const computed = computeMeasurementBetweenTargets(
        anchorMeasureTargetRef.current,
        hit
      );
      commitMeasurement(computed);
      setAnchorMeasureTarget(null);
      setHoverMeasureTarget(hit);
    }
  };

  const handleCopyCoordinates = async () => {
    if (!pickedCoordinate) return;
    const { x, y, z } = pickedCoordinate.georeferencedPoint;
    const text = `${formatCoordinate(x)}; ${formatCoordinate(
      y
    )}; ${formatCoordinate(z)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCoordinateText(true);
    } catch {
      // Clipboard API may fail in non-secure contexts
    }
  };

  const handleViewportContextMenu = async (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isEngineReady) return;

    const downPos = rightPointerDownRef.current;
    rightPointerDownRef.current = null;
    if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 4) {
      return;
    }

    if (activeToolRef.current === 'measure' && anchorMeasureTargetRef.current) {
      measurePickReqIdRef.current++;
      setAnchorMeasureTarget(null);
      return;
    }

    const reqId = ++contextMenuReqIdRef.current;
    const clientX = e.clientX;
    const clientY = e.clientY;
    const faceHit = await pickFaceAtClientPoint(clientX, clientY);
    if (reqId !== contextMenuReqIdRef.current) return;

    const hasActiveSections = (clipper?.list.size ?? 0) > 0 || isSectionActive;
    if (!faceHit && !hasActiveSections) {
      setFaceContextMenu(null);
      return;
    }

    const menuWidth = 216;
    const menuHeight = faceHit && hasActiveSections ? 124 : faceHit ? 84 : 44;
    const x = Math.min(clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(clientY, Math.max(8, window.innerHeight - menuHeight - 8));
    setFaceContextMenu({ x, y, faceHit });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    await loadLocalFragFiles(e.dataTransfer.files);
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await loadLocalFragFiles(e.target.files);
    e.target.value = '';
  };

  const hasActiveSections = (clipper?.list.size ?? 0) > 0 || isSectionActive;

  return (
    <div
      className="w-full h-full relative bg-asphalt-950 overflow-hidden select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".frag,.ifc"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />

      {/* WebGL / Three.js Canvas Mount Container */}
      <div
        id="viewer-container"
        ref={containerRef}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={(e) => void handleViewportPointerMove(e)}
        onPointerUp={(e) => void handleViewportPointerUp(e)}
        onPointerLeave={() => {
          setHoverCoordinate(null);
          setHoverMeasureTarget(null);
          leftPointerDownRef.current = null;
        }}
        onContextMenu={(e) => void handleViewportContextMenu(e)}
        className={`w-full h-full bg-asphalt-950 ${
          activeTool === 'coordinates' || activeTool === 'measure'
            ? 'cursor-crosshair'
            : ''
        }`}
      />

      {/* Measure Snap Point Indicator (vertex dot or edge anchor dot; edges/planes highlight directly in 3D) */}
      {activeTool === 'measure' &&
        measureMode === 'length' &&
        hoverMeasureTarget &&
        hoverMeasureScreenPos &&
        hoverMeasureTarget.kind !== 'face' && (
          <div
            style={{
              left: hoverMeasureScreenPos.x,
              top: hoverMeasureScreenPos.y,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-[15] pointer-events-none"
          >
            {hoverMeasureTarget.kind === 'point' ? (
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white bg-pavasal-400 shadow-[0_0_10px_rgba(250,204,21,0.95)]" />
            ) : (
              <div className="w-2.5 h-2.5 rotate-45 border-2 border-white bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.95)]" />
            )}
          </div>
        )}

      {/* Locked First Anchor Point Marker (for point snaps; anchored edges/planes glow in 3D) */}
      {activeTool === 'measure' &&
        measureMode === 'length' &&
        anchorMeasureTarget &&
        anchorMeasureTarget.kind === 'point' &&
        anchorMeasureScreenPos && (
          <div
            style={{
              left: anchorMeasureScreenPos.x,
              top: anchorMeasureScreenPos.y,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-[15] pointer-events-none"
          >
            <div className="w-4 h-4 rounded-full border-2 border-white bg-pavasal-500 shadow-[0_0_10px_rgba(250,204,21,0.95)] flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-asphalt-950" />
            </div>
          </div>
        )}

      {/* Coordinate Hover Vertex Snap Preview */}
      {activeTool === 'coordinates' && hoverCoordinate && hoverScreenPos && (
        <div
          style={{
            left: hoverScreenPos.x,
            top: hoverScreenPos.y,
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 z-[15] pointer-events-none"
        >
          {hoverCoordinate.snappedToVertex ? (
            <div className="w-4 h-4 rounded-full border-2 border-pavasal-400 bg-pavasal-500/20 shadow-[0_0_8px_rgba(250,204,21,0.7)] flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-pavasal-300" />
            </div>
          ) : (
            <div className="w-2.5 h-2.5 rounded-full border border-asphalt-200/80 bg-asphalt-950/60" />
          )}
        </div>
      )}

      {/* Pinned Coordinate Marker */}
      {pickedCoordinate && pinnedScreenPos && (
        <div
          style={{
            left: pinnedScreenPos.x,
            top: pinnedScreenPos.y,
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 z-[15] pointer-events-none"
        >
          <svg
            className="w-6 h-6 text-pavasal-400 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </div>
      )}

      {/* Initializing Engine Indicator */}
      {!isEngineReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-asphalt-950/90 z-10 pointer-events-none">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-pavasal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-asphalt-200">
              Inicializando motor BIM 3D...
            </p>
          </div>
        </div>
      )}

      {/* Parsing / Uploading / Converting Model Overlay */}
      {isEngineReady && isLoadingModel && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-asphalt-950/95 border border-pavasal-500/70 px-4 py-2 rounded-full text-xs text-asphalt-100 shadow-xl flex items-center gap-2.5">
            <div className="w-3.5 h-3.5 border-2 border-pavasal-500 border-t-transparent rounded-full animate-spin" />
            <span>
              <strong className="text-pavasal-400">
                {loadingModelName || 'Procesando modelo...'}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Empty Viewport Interactive CTA (works without selecting a project) */}
      {isEngineReady && loadedModels.length === 0 && !isDraggingFile && !isLoadingModel && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-asphalt-900/95 backdrop-blur border border-asphalt-700 px-4 py-2.5 rounded-xl text-xs text-asphalt-200 shadow-2xl flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-pavasal-500 animate-pulse shrink-0" />
            <span>
              Arrastra archivos <code className="text-pavasal-400 font-mono">.frag</code> o{' '}
              <code className="text-pavasal-400 font-mono">.ifc</code> aquí o
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded bg-pavasal-500 px-3 py-1 text-xs font-bold text-asphalt-950 hover:bg-pavasal-400 transition-colors shrink-0"
            >
              Subir .frag / .ifc
            </button>
          </div>
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 bg-pavasal-950/35 backdrop-blur-sm border-2 border-dashed border-pavasal-500 z-20 flex items-center justify-center pointer-events-none">
          <div className="bg-asphalt-950/95 px-6 py-4 rounded-xl border border-pavasal-500/70 text-center shadow-2xl">
            <p className="text-sm font-semibold text-pavasal-400">
              Soltar archivo(s) .frag o .ifc aquí
            </p>
            <p className="text-xs text-asphalt-300 mt-1">
              Los .ifc se convierten al vuelo en memoria y se renderizan en local
            </p>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {viewerToastError && (
        <div className="absolute top-4 right-4 bg-red-950/95 border border-red-600 text-red-100 text-xs px-4 py-2.5 rounded-lg shadow-lg z-30 flex items-center gap-2">
          <span>{viewerToastError}</span>
          <button
            type="button"
            onClick={() => setViewerToastError(null)}
            className="text-red-300 hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Face Right-Click Context Menu */}
      {faceContextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          onContextMenu={(e) => e.preventDefault()}
          style={{ left: faceContextMenu.x, top: faceContextMenu.y }}
          className="fixed z-50 min-w-[208px] rounded-md border border-asphalt-600 bg-asphalt-900 py-1 shadow-2xl"
        >
          {faceContextMenu.faceHit && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const hit = faceContextMenu.faceHit;
                  if (hit) createSectionFromFace(hit.point, hit.normal);
                  setFaceContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-asphalt-100 hover:bg-pavasal-500 hover:text-asphalt-950 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5 shrink-0"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 8h12" strokeDasharray="2 2" />
                  <path d="M4.5 3.5v9M11.5 3.5v9" />
                </svg>
                <span>Crear sección</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const hit = faceContextMenu.faceHit;
                  if (hit) void lookPerpendicularToFace(hit.point, hit.normal);
                  setFaceContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-asphalt-100 hover:bg-pavasal-500 hover:text-asphalt-950 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5 shrink-0"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="10" height="10" rx="1" />
                  <circle cx="8" cy="8" r="2" />
                </svg>
                <span>Mirar en perpendicular</span>
              </button>
            </>
          )}
          {faceContextMenu.faceHit && hasActiveSections && (
            <div className="my-1 h-px bg-asphalt-700" />
          )}
          {hasActiveSections && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                clearSections();
                setFaceContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/20 hover:text-red-100 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
              <span>Eliminar secciones</span>
            </button>
          )}
        </div>
      )}

      {/* Coordinate Inspector Floating Card / Hint */}
      {isEngineReady && pickedCoordinate ? (
        <div className="absolute bottom-4 left-4 z-20 w-[352px] max-w-[calc(100vw-2rem)] rounded-xl border border-asphalt-700 bg-asphalt-900/95 backdrop-blur p-3 text-xs text-asphalt-100 shadow-2xl">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-asphalt-700/80">
            <div className="flex items-center gap-1.5 min-w-0">
              <svg
                className="w-3.5 h-3.5 text-pavasal-400 shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="4.8" />
                <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
                <path d="M8 1.2v2.3M8 12.5v2.3M1.2 8h2.3M12.5 8h2.3" />
              </svg>
              <span className="font-semibold text-white truncate">
                Coordenadas
              </span>
              {pickedCoordinate.georeferencedPoint.crsName && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-asphalt-800 text-asphalt-300 border border-asphalt-700 shrink-0">
                  {pickedCoordinate.georeferencedPoint.crsName}
                </span>
              )}
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                  pickedCoordinate.snappedToVertex
                    ? 'bg-pavasal-500/20 text-pavasal-300 border border-pavasal-500/40'
                    : 'bg-asphalt-800 text-asphalt-300 border border-asphalt-700'
                }`}
              >
                {pickedCoordinate.snappedToVertex ? 'Vértice' : 'Superficie'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPickedCoordinate(null)}
              className="text-asphalt-400 hover:text-white px-1 leading-none"
              title="Cerrar coordenadas"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 py-2.5 font-mono">
            <div className="rounded bg-asphalt-950/90 border border-asphalt-800 px-2 py-1.5">
              <div className="text-[10px] font-sans font-semibold text-red-400">
                X (m)
              </div>
              <div
                className="text-xs text-white truncate"
                title={String(pickedCoordinate.georeferencedPoint.x)}
              >
                {formatCoordinate(pickedCoordinate.georeferencedPoint.x)}
              </div>
            </div>
            <div className="rounded bg-asphalt-950/90 border border-asphalt-800 px-2 py-1.5">
              <div className="text-[10px] font-sans font-semibold text-emerald-400">
                Y (m)
              </div>
              <div
                className="text-xs text-white truncate"
                title={String(pickedCoordinate.georeferencedPoint.y)}
              >
                {formatCoordinate(pickedCoordinate.georeferencedPoint.y)}
              </div>
            </div>
            <div className="rounded bg-asphalt-950/90 border border-asphalt-800 px-2 py-1.5">
              <div className="text-[10px] font-sans font-semibold text-sky-400">
                Z (m)
              </div>
              <div
                className="text-xs text-white truncate"
                title={String(pickedCoordinate.georeferencedPoint.z)}
              >
                {formatCoordinate(pickedCoordinate.georeferencedPoint.z)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-asphalt-400 truncate">
              {activeTool === 'coordinates'
                ? 'Haz clic en otro vértice para actualizar'
                : 'Reactiva Coordenadas para medir otro'}
            </span>
            <button
              type="button"
              onClick={() => void handleCopyCoordinates()}
              className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-1 text-[11px] font-medium text-asphalt-100 hover:border-pavasal-500 hover:text-pavasal-300 transition-colors shrink-0"
            >
              {copiedCoordinateText ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      ) : (
        isEngineReady &&
        activeTool === 'coordinates' &&
        loadedModels.length > 0 && (
          <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
            <div className="bg-asphalt-900/95 backdrop-blur border border-pavasal-500/50 px-3.5 py-2 rounded-lg text-xs text-asphalt-100 shadow-xl flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-pavasal-500 animate-pulse shrink-0" />
              <span>
                Pincha en un vértice del modelo para consultar sus coordenadas{' '}
                <strong className="text-pavasal-400">X, Y, Z</strong> (Esc para salir)
              </span>
            </div>
          </div>
        )
      )}

      {/* Active Area / Volume Measure Prompt Hint when empty */}
      {isEngineReady &&
        loadedModels.length > 0 &&
        activeTool === 'measure' &&
        ((measureMode === 'area' && areaItems.length === 0) ||
          (measureMode === 'volume' && volumeItems.length === 0)) && (
          <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
            <div className="bg-asphalt-900/95 backdrop-blur border border-emerald-500/50 px-3.5 py-2 rounded-lg text-xs text-asphalt-100 shadow-xl flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>
                {measureMode === 'area'
                  ? 'Pincha sobre una cara para medir su área · Mantén Ctrl + clic para sumar'
                  : 'Pincha un elemento para medir su volumen geométrico · Mantén Ctrl + clic para sumar'}
              </span>
            </div>
          </div>
        )}

      {/* Active Measurements Quick Actions */}
      {isEngineReady &&
        loadedModels.length > 0 &&
        activeTool !== 'coordinates' &&
        (measurementCount > 0 || areaItems.length > 0 || volumeItems.length > 0) && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
            <div className="bg-asphalt-900/90 backdrop-blur border border-asphalt-700 px-3 py-1.5 rounded-lg text-[11px] text-asphalt-200 shadow-lg flex items-center gap-2.5 whitespace-nowrap">
              {areaItems.length > 0 && (
                <span>
                  Área ({formatDecimalEs(areaItems.length, 0)}):{' '}
                  <strong className="text-emerald-400 tabular-nums">
                    {formatDecimalEs(totalArea, 3)} m²
                  </strong>
                </span>
              )}
              {volumeItems.length > 0 && (
                <span>
                  Volumen ({formatDecimalEs(volumeItems.length, 0)}):{' '}
                  <strong className="text-emerald-400 tabular-nums">
                    {formatDecimalEs(totalVolume, 3)} m³
                  </strong>
                </span>
              )}
              {measurementCount > 0 && (
                <span>
                  Distancias:{' '}
                  <strong className="text-pavasal-400 tabular-nums">
                    {formatDecimalEs(measurementCount, 0)}
                  </strong>
                </span>
              )}
              {activeTool === 'measure' &&
                ((measureMode === 'area' && areaItems.length > 0) ||
                  (measureMode === 'volume' && volumeItems.length > 0)) && (
                  <span className="text-asphalt-400 hidden sm:inline">
                    · Ctrl + clic suma
                  </span>
                )}
              {activeTool === 'measure' &&
                ((measureMode === 'area' && areaItems.length > 0) ||
                  (measureMode === 'volume' && volumeItems.length > 0) ||
                  (measureMode === 'length' && measurementCount > 0)) && (
                  <button
                    type="button"
                    onClick={handleUndoMeasurement}
                    className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-0.5 text-[11px] font-medium text-asphalt-100 hover:border-pavasal-500 hover:text-pavasal-300 transition-colors"
                    title="Eliminar la última medición (Supr / Retroceso)"
                  >
                    Deshacer
                  </button>
                )}
              <button
                type="button"
                onClick={handleClearAllMeasurements}
                className="rounded border border-asphalt-700 bg-asphalt-800 px-2 py-0.5 text-[11px] font-medium text-asphalt-100 hover:border-red-500/70 hover:text-red-300 transition-colors"
                title="Eliminar todas las mediciones"
              >
                Limpiar
              </button>
            </div>
          </div>
        )}
    </div>
  );
};

export default ViewerCanvas;
