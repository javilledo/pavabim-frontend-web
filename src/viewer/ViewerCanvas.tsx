import React, { useEffect, useRef, useState } from 'react';
import { useLocalFragUpload } from '../hooks/useLocalFragUpload';
import { useViewerStore } from '../store/useViewerStore';
import { useEngine } from './EngineContext';

export const ViewerCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    isEngineReady,
    initEngine,
    disposeEngine,
    clearSelection,
    clipper,
    world,
  } = useEngine();
  const {
    activeTool,
    loadedModels,
    isLoadingModel,
    loadingModelName,
    viewerToastError,
    setActiveTool,
    setViewerToastError,
  } = useViewerStore();
  const { loadLocalFragFiles } = useLocalFragUpload();
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    initEngine(container);

    return () => {
      disposeEngine();
    };
  }, [initEngine, disposeEngine]);

  // Keyboard shortcuts (Escape clears selection and reverts to select mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
        setActiveTool('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, setActiveTool]);

  useEffect(() => {
    if (!viewerToastError) return;
    const timer = window.setTimeout(() => setViewerToastError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [viewerToastError, setViewerToastError]);

  const handleDoubleClick = () => {
    if (!isEngineReady || !world) return;

    if (activeTool === 'section' && clipper && clipper.enabled) {
      clipper.create(world);
    }
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

  return (
    <div
      className="w-full h-full relative bg-asphalt-950 overflow-hidden select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDoubleClick={handleDoubleClick}
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
        className="w-full h-full bg-asphalt-950"
      />

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
    </div>
  );
};

export default ViewerCanvas;
