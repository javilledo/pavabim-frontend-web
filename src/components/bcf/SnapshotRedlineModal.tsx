import React, { useCallback, useEffect, useRef, useState } from 'react';
import { compressCanvasToBudgetDataUrl } from '../../viewer/BcfViewerBridge';

export type RedlineTool = 'arrow' | 'rect' | 'cloud' | 'text';

interface NormalizedPoint {
  x: number;
  y: number;
}

interface RedlineShape {
  tool: RedlineTool;
  color: string;
  strokeWidth: number;
  start: NormalizedPoint;
  end: NormalizedPoint;
  text?: string;
}

interface SnapshotRedlineModalProps {
  isOpen: boolean;
  rawSnapshotDataUrl: string;
  snapshotWidth: number;
  snapshotHeight: number;
  title?: string;
  onCancel: () => void;
  onConfirm: (finalSnapshotDataUrl: string) => void;
}

const REDLINE_COLORS = [
  { hex: '#ef4444', label: 'Rojo' },
  { hex: '#facc15', label: 'Amarillo' },
  { hex: '#22c55e', label: 'Verde' },
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#ffffff', label: 'Blanco' },
];

const STROKE_SIZES = [
  { value: 3, label: 'Fino' },
  { value: 5, label: 'Medio' },
  { value: 8, label: 'Grueso' },
];

function drawArrowShape(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;

  const headLen = Math.max(14, lineWidth * 3.8);
  const angle = Math.atan2(dy, dx);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function drawRevisionCloud(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
): void {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const width = right - left;
  const height = bottom - top;
  if (width < 8 || height < 8) return;

  const targetChord = Math.max(18, lineWidth * 4.5);

  const drawCloudEdge = (
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    firstMove: boolean,
  ) => {
    const edgeLen = Math.hypot(ex - sx, ey - sy);
    const steps = Math.max(2, Math.round(edgeLen / targetChord));
    const ux = (ex - sx) / steps;
    const uy = (ey - sy) / steps;
    // Outward normal for clockwise perimeter (left->right, top->bottom, right->left, bottom->top)
    const nx = uy * 0.55;
    const ny = -ux * 0.55;

    if (firstMove) {
      ctx.moveTo(sx, sy);
    }
    for (let i = 0; i < steps; i++) {
      const px = sx + ux * i;
      const py = sy + uy * i;
      const qx = sx + ux * (i + 1);
      const qy = sy + uy * (i + 1);
      const cx = (px + qx) * 0.5 + nx;
      const cy = (py + qy) * 0.5 + ny;
      ctx.quadraticCurveTo(cx, cy, qx, qy);
    }
  };

  ctx.beginPath();
  drawCloudEdge(left, top, right, top, true);
  drawCloudEdge(right, top, right, bottom, false);
  drawCloudEdge(right, bottom, left, bottom, false);
  drawCloudEdge(left, bottom, left, top, false);
  ctx.closePath();
  ctx.stroke();
}

function drawShapeOnContext(
  ctx: CanvasRenderingContext2D,
  shape: RedlineShape,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const scaleFactor = Math.max(1, Math.max(canvasWidth, canvasHeight) / 1000);
  const lineWidth = Math.max(2, shape.strokeWidth * scaleFactor);
  const x1 = shape.start.x * canvasWidth;
  const y1 = shape.start.y * canvasHeight;
  const x2 = shape.end.x * canvasWidth;
  const y2 = shape.end.y * canvasHeight;

  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 3 * scaleFactor;

  if (shape.tool === 'arrow') {
    drawArrowShape(ctx, x1, y1, x2, y2, lineWidth);
  } else if (shape.tool === 'rect') {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    if (w > 2 && h > 2) {
      ctx.strokeRect(left, top, w, h);
    }
  } else if (shape.tool === 'cloud') {
    drawRevisionCloud(ctx, x1, y1, x2, y2, lineWidth);
  } else if (shape.tool === 'text' && shape.text) {
    const fontSize = Math.round(Math.max(16, (14 + shape.strokeWidth * 2) * scaleFactor));
    ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const metrics = ctx.measureText(shape.text);
    const padX = 8 * scaleFactor;
    const padY = 5 * scaleFactor;
    const boxW = metrics.width + padX * 2;
    const boxH = fontSize + padY * 2;

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x1, y1 - boxH * 0.75, boxW, boxH, 5 * scaleFactor);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 1.8 * scaleFactor);
    ctx.strokeStyle = shape.color;
    ctx.stroke();

    ctx.fillStyle = shape.color;
    ctx.fillText(shape.text, x1 + padX, y1 + padY * 0.15);
  }

  ctx.restore();
}

export const SnapshotRedlineModal: React.FC<SnapshotRedlineModalProps> = ({
  isOpen,
  rawSnapshotDataUrl,
  snapshotWidth,
  snapshotHeight,
  title = 'Capturar y anotar punto de vista 3D',
  onCancel,
  onConfirm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);

  const [activeTool, setActiveTool] = useState<RedlineTool>('arrow');
  const [activeColor, setActiveColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [shapes, setShapes] = useState<RedlineShape[]>([]);
  const [draftShape, setDraftShape] = useState<RedlineShape | null>(null);
  const [pendingTextAnchor, setPendingTextAnchor] =
    useState<NormalizedPoint | null>(null);
  const [pendingTextValue, setPendingTextValue] = useState('');
  const [imageReady, setImageReady] = useState(false);

  const resolvedWidth = Math.max(320, snapshotWidth || 1280);
  const resolvedHeight = Math.max(200, snapshotHeight || 720);

  useEffect(() => {
    if (!isOpen || !rawSnapshotDataUrl) {
      setShapes([]);
      setDraftShape(null);
      setPendingTextAnchor(null);
      setPendingTextValue('');
      setImageReady(false);
      return;
    }

    const img = new Image();
    img.onload = () => {
      baseImageRef.current = img;
      setImageReady(true);
    };
    img.src = rawSnapshotDataUrl;
  }, [isOpen, rawSnapshotDataUrl]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = baseImageRef.current;
    if (!canvas || !img || !imageReady) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const s of shapes) {
      drawShapeOnContext(ctx, s, canvas.width, canvas.height);
    }
    if (draftShape) {
      drawShapeOnContext(ctx, draftShape, canvas.width, canvas.height);
    }
  }, [draftShape, imageReady, shapes]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingTextAnchor) {
          setPendingTextAnchor(null);
          setPendingTextValue('');
        } else {
          onCancel();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (!pendingTextAnchor) {
          e.preventDefault();
          setShapes((prev) => prev.slice(0, -1));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel, pendingTextAnchor]);

  if (!isOpen) return null;

  const getNormalizedPointer = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): NormalizedPoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height))),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const pt = getNormalizedPointer(e);

    if (activeTool === 'text') {
      setPendingTextAnchor(pt);
      setPendingTextValue('');
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    setDraftShape({
      tool: activeTool,
      color: activeColor,
      strokeWidth,
      start: pt,
      end: pt,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftShape) return;
    const pt = getNormalizedPointer(e);
    setDraftShape((prev) => (prev ? { ...prev, end: pt } : null));
  };

  const handlePointerUp = () => {
    if (!draftShape) return;
    const dx = Math.abs(draftShape.end.x - draftShape.start.x);
    const dy = Math.abs(draftShape.end.y - draftShape.start.y);
    if (dx > 0.008 || dy > 0.008) {
      setShapes((prev) => [...prev, draftShape]);
    }
    setDraftShape(null);
  };

  const commitPendingText = () => {
    if (pendingTextAnchor && pendingTextValue.trim()) {
      setShapes((prev) => [
        ...prev,
        {
          tool: 'text',
          color: activeColor,
          strokeWidth,
          start: pendingTextAnchor,
          end: pendingTextAnchor,
          text: pendingTextValue.trim(),
        },
      ]);
    }
    setPendingTextAnchor(null);
    setPendingTextValue('');
  };

  const handleConfirmAnnotated = () => {
    if (shapes.length === 0) {
      onConfirm(rawSnapshotDataUrl);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      onConfirm(rawSnapshotDataUrl);
      return;
    }
    onConfirm(compressCanvasToBudgetDataUrl(canvas).dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-lg border border-asphalt-700 bg-asphalt-900 shadow-2xl flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-asphalt-700 bg-asphalt-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-2 h-2 rounded-full bg-pavasal-500 shrink-0" />
            <h3 className="text-sm font-bold text-asphalt-50 truncate">
              {title}
            </h3>
            <span className="hidden sm:inline-block rounded bg-asphalt-800 px-2 py-0.5 text-[10px] font-mono text-asphalt-300">
              {resolvedWidth}×{resolvedHeight}px
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-asphalt-400 hover:text-asphalt-100 px-1.5 py-0.5 rounded"
            title="Cancelar captura (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Redlining Toolbar */}
        <div className="px-4 py-2 border-b border-asphalt-800 bg-asphalt-900 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'arrow', label: '↗ Flecha' },
                { id: 'rect', label: '▭ Rectángulo' },
                { id: 'cloud', label: '☁ Nube revisión' },
                { id: 'text', label: 'T Texto' },
              ] as Array<{ id: RedlineTool; label: string }>
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPendingTextAnchor(null);
                  setActiveTool(item.id);
                }}
                className={`px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                  activeTool === item.id
                    ? 'border-pavasal-500 bg-pavasal-500 text-asphalt-950 font-bold'
                    : 'border-asphalt-700 bg-asphalt-800 text-asphalt-200 hover:border-pavasal-500/60'
                }`}
              >
                {item.label}
              </button>
            ))}

            <div className="h-4 w-px bg-asphalt-700 mx-1" />

            {/* Color Swatches */}
            <div className="flex items-center gap-1">
              {REDLINE_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setActiveColor(c.hex)}
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                  aria-label={`Color ${c.label}`}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    activeColor === c.hex
                      ? 'border-white ring-2 ring-pavasal-400 scale-110'
                      : 'border-asphalt-600 hover:scale-110'
                  }`}
                />
              ))}
            </div>

            <div className="h-4 w-px bg-asphalt-700 mx-1" />

            {/* Stroke Width */}
            <div className="flex items-center gap-1">
              {STROKE_SIZES.map((sz) => (
                <button
                  key={sz.value}
                  type="button"
                  onClick={() => setStrokeWidth(sz.value)}
                  className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${
                    strokeWidth === sz.value
                      ? 'border-pavasal-500 bg-asphalt-800 text-pavasal-400 font-semibold'
                      : 'border-asphalt-700 bg-asphalt-950/60 text-asphalt-300 hover:text-asphalt-100'
                  }`}
                >
                  {sz.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={shapes.length === 0}
              onClick={() => setShapes((prev) => prev.slice(0, -1))}
              className="px-2 py-1 rounded border border-asphalt-700 bg-asphalt-800 text-[11px] text-asphalt-200 hover:border-pavasal-500/50 disabled:opacity-40"
              title="Deshacer última marca (Ctrl+Z)"
            >
              ↶ Deshacer
            </button>
            <button
              type="button"
              disabled={shapes.length === 0}
              onClick={() => setShapes([])}
              className="px-2 py-1 rounded border border-asphalt-700 bg-asphalt-800 text-[11px] text-red-300 hover:border-red-500/50 disabled:opacity-40"
            >
              Limpiar marcas
            </button>
          </div>
        </div>

        {/* Interactive Canvas Area */}
        <div className="flex-1 min-h-0 bg-asphalt-950 p-3 flex items-center justify-center overflow-auto relative">
          <div className="relative inline-block max-w-full max-h-full shadow-xl border border-asphalt-700 rounded overflow-hidden">
            <canvas
              ref={canvasRef}
              width={resolvedWidth}
              height={resolvedHeight}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="block max-w-full max-h-[64vh] w-auto h-auto cursor-crosshair touch-none"
            />

            {pendingTextAnchor && (
              <div
                style={{
                  left: `${Math.min(78, pendingTextAnchor.x * 100)}%`,
                  top: `${Math.min(86, Math.max(6, pendingTextAnchor.y * 100))}%`,
                }}
                className="absolute z-10 flex items-center gap-1 bg-asphalt-900 border border-pavasal-500 rounded p-1 shadow-xl"
              >
                <input
                  type="text"
                  autoFocus
                  value={pendingTextValue}
                  onChange={(e) => setPendingTextValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitPendingText();
                    } else if (e.key === 'Escape') {
                      setPendingTextAnchor(null);
                      setPendingTextValue('');
                    }
                  }}
                  placeholder="Escribe anotación..."
                  className="w-44 rounded bg-asphalt-950 border border-asphalt-700 px-2 py-1 text-[11px] text-asphalt-50 focus:outline-none focus:border-pavasal-500"
                />
                <button
                  type="button"
                  onClick={commitPendingText}
                  className="rounded bg-pavasal-500 px-2 py-1 text-[10px] font-bold text-asphalt-950 hover:bg-pavasal-400"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-2.5 border-t border-asphalt-700 bg-asphalt-950 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-asphalt-400">
            {shapes.length === 0
              ? 'Dibuja sobre la captura o guarda directamente sin anotaciones.'
              : `${shapes.length} ${shapes.length === 1 ? 'anotación añadida' : 'anotaciones añadidas'} sobre la captura.`}
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded border border-asphalt-700 bg-asphalt-800 text-asphalt-200 hover:text-asphalt-50 font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onConfirm(rawSnapshotDataUrl)}
              className="px-3 py-1.5 rounded border border-pavasal-500/60 bg-asphalt-800 text-pavasal-400 hover:bg-asphalt-700 font-semibold transition-colors"
            >
              Guardar sin anotar
            </button>
            <button
              type="button"
              onClick={handleConfirmAnnotated}
              className="px-3.5 py-1.5 rounded bg-pavasal-500 text-asphalt-950 font-bold hover:bg-pavasal-400 transition-colors"
            >
              {shapes.length > 0 ? 'Confirmar con anotaciones' : 'Confirmar captura'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SnapshotRedlineModal;
