import { useCallback, useEffect, useState } from "react";
import { MS_PER_PX_BASE, ZOOM_LIMITS, ZOOM_STEP } from "./constants";
import type { ZoomState } from "./types";

interface ZoomActions {
  zoom: ZoomState;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  zoomToFit: (timeSpanMs: number, canvasWidthPx: number) => void;
  handleWheelZoom: (deltaY: number, clientX: number, canvasLeft: number) => void;
}

function clamp(scale: number): number {
  return Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, scale));
}

export function useZoom(): ZoomActions {
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, panX: 0 });

  const zoomIn = useCallback(() => {
    setZoom((z) => ({ ...z, scale: clamp(z.scale * ZOOM_STEP) }));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => ({ ...z, scale: clamp(z.scale / ZOOM_STEP) }));
  }, []);

  const resetZoom = useCallback(() => setZoom({ scale: 1, panX: 0 }), []);

  const zoomToFit = useCallback((timeSpanMs: number, canvasWidthPx: number) => {
    if (timeSpanMs <= 0 || canvasWidthPx <= 0) return;
    // scale = (canvasWidth * MS_PER_PX_BASE) / timeSpan, with some padding
    const fitScale = clamp((canvasWidthPx * MS_PER_PX_BASE) / (timeSpanMs * 1.05));
    setZoom({ scale: fitScale, panX: 0 });
  }, []);

  const handleWheelZoom = useCallback((deltaY: number, clientX: number, canvasLeft: number) => {
    setZoom((z) => {
      const factor = deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newScale = clamp(z.scale * factor);
      const cursorOffset = clientX - canvasLeft + z.panX;
      const newPanX = cursorOffset * (newScale / z.scale) - (clientX - canvasLeft);
      return { scale: newScale, panX: Math.max(0, newPanX) };
    });
  }, []);

  // Keyboard shortcuts: +/= zoom in, - zoom out, 0 reset
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomIn();
      }
      if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      }
      if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [zoomIn, zoomOut, resetZoom]);

  return { zoom, zoomIn, zoomOut, resetZoom, zoomToFit, handleWheelZoom };
}
