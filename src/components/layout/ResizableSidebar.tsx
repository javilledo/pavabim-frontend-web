import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ResizableSidebarProps {
  side: 'left' | 'right';
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  ariaLabel: string;
  children: React.ReactNode;
}

const KEYBOARD_STEP_PX = 16;

function getMaxAllowedWidth(minWidth: number, maxWidth: number): number {
  if (typeof window === 'undefined') return maxWidth;
  return Math.min(maxWidth, Math.max(minWidth, Math.floor(window.innerWidth * 0.48)));
}

function clampWidth(value: number, minWidth: number, maxWidth: number): number {
  const dynamicMax = getMaxAllowedWidth(minWidth, maxWidth);
  return Math.min(dynamicMax, Math.max(minWidth, Math.round(value)));
}

function readSavedWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number
): number {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return clampWidth(defaultWidth, minWidth, maxWidth);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return clampWidth(defaultWidth, minWidth, maxWidth);
    return clampWidth(parsed, minWidth, maxWidth);
  } catch {
    return clampWidth(defaultWidth, minWidth, maxWidth);
  }
}

function saveWidth(storageKey: string, width: number): void {
  try {
    window.localStorage.setItem(storageKey, String(width));
  } catch {
    // Ignore storage errors (e.g. private mode or quota exceeded)
  }
}

/**
 * Lateral resizable panel wrapper supporting drag, double-click reset,
 * keyboard adjustments, viewport-aware clamping, and localStorage persistence.
 */
export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  side,
  storageKey,
  defaultWidth = 300,
  minWidth = 240,
  maxWidth = 760,
  ariaLabel,
  children,
}) => {
  const [width, setWidth] = useState<number>(() =>
    readSavedWidth(storageKey, defaultWidth, minWidth, maxWidth)
  );
  const [isDragging, setIsDragging] = useState(false);

  const widthRef = useRef(width);
  widthRef.current = width;

  const dragStartRef = useRef<{ clientX: number; width: number } | null>(null);

  const commitWidth = useCallback(
    (nextWidth: number) => {
      const clamped = clampWidth(nextWidth, minWidth, maxWidth);
      setWidth(clamped);
      saveWidth(storageKey, clamped);
    },
    [minWidth, maxWidth, storageKey]
  );

  useEffect(() => {
    const handleWindowResize = () => {
      setWidth((prev) => {
        const clamped = clampWidth(prev, minWidth, maxWidth);
        if (clamped !== prev) {
          saveWidth(storageKey, clamped);
        }
        return clamped;
      });
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [minWidth, maxWidth, storageKey]);

  useEffect(() => {
    if (!isDragging) return;

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = event.clientX - dragStartRef.current.clientX;
      const signedDelta = side === 'left' ? deltaX : -deltaX;
      const clamped = clampWidth(dragStartRef.current.width + signedDelta, minWidth, maxWidth);
      setWidth(clamped);
    };

    const stopDragging = () => {
      dragStartRef.current = null;
      setIsDragging(false);
      saveWidth(storageKey, widthRef.current);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [isDragging, side, minWidth, maxWidth, storageKey]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragStartRef.current = { clientX: event.clientX, width: widthRef.current };
    setIsDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }
  };

  const handleDoubleClick = () => {
    commitWidth(defaultWidth);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const signedStep = (side === 'left' ? direction : -direction) * KEYBOARD_STEP_PX;
    commitWidth(widthRef.current + signedStep);
  };

  const borderClass = side === 'left' ? 'border-r border-asphalt-700' : 'border-l border-asphalt-700';
  const handlePositionClass = side === 'left' ? '-right-1' : '-left-1';
  const dynamicMax = getMaxAllowedWidth(minWidth, maxWidth);

  return (
    <aside
      style={{ width: `${width}px` }}
      className={`relative flex-shrink-0 bg-asphalt-900 text-asphalt-100 ${borderClass} flex flex-col select-none`}
    >
      {children}

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={ariaLabel}
        aria-valuemin={minWidth}
        aria-valuemax={dynamicMax}
        aria-valuenow={width}
        tabIndex={0}
        title="Arrastra para ajustar el ancho (doble clic para restablecer)"
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        className={`absolute top-0 bottom-0 ${handlePositionClass} w-2 z-20 cursor-col-resize group flex items-center justify-center focus:outline-none`}
      >
        <div
          className={`w-[2px] h-full transition-colors ${
            isDragging
              ? 'bg-pavasal-500'
              : 'bg-transparent group-hover:bg-pavasal-500/75 group-focus-visible:bg-pavasal-500'
          }`}
        />
        <div
          className={`absolute w-1 h-10 rounded-full transition-colors ${
            isDragging
              ? 'bg-pavasal-400'
              : 'bg-asphalt-600/70 group-hover:bg-pavasal-400 group-focus-visible:bg-pavasal-400'
          }`}
        />
      </div>
    </aside>
  );
};

export default ResizableSidebar;

