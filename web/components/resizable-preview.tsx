"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

const MIN_PREVIEW_WIDTH = 24;
const MAX_PREVIEW_WIDTH = 48;
const DEFAULT_PREVIEW_WIDTH = 34;

function clampPreviewWidth(value: number) {
  return Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, value));
}

export function useResizablePreview() {
  const workbenchRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(DEFAULT_PREVIEW_WIDTH);

  function resizeFromPointer(event: PointerEvent<HTMLButtonElement>) {
    const workbench = workbenchRef.current;
    if (!workbench) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const updateWidth = (clientX: number) => {
      const bounds = workbench.getBoundingClientRect();
      const nextWidth = ((bounds.right - clientX) / bounds.width) * 100;
      setPreviewWidth(clampPreviewWidth(nextWidth));
    };

    updateWidth(event.clientX);

    const handleMove = (moveEvent: globalThis.PointerEvent) => updateWidth(moveEvent.clientX);
    const handleEnd = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  }

  const style = {
    "--catalog-preview-width": `${previewWidth}%`,
  } as CSSProperties;

  return {
    previewWidth,
    setPreviewWidth: (value: number) => setPreviewWidth(clampPreviewWidth(value)),
    resizeFromPointer,
    style,
    workbenchRef,
  };
}

type PreviewResizeControlsProps = {
  previewWidth: number;
  onChange: (value: number) => void;
};

export function PreviewResizeControls({
  previewWidth,
  onChange,
}: PreviewResizeControlsProps) {
  return (
    <div className="catalog-selector__previewResizeControls" aria-label="Preview width">
      <span>Preview width</span>
      <button
        type="button"
        aria-label="Make preview narrower"
        onClick={() => onChange(previewWidth - 4)}
      >
        −
      </button>
      <button
        type="button"
        aria-label="Reset preview width"
        onClick={() => onChange(DEFAULT_PREVIEW_WIDTH)}
      >
        {Math.round(previewWidth)}%
      </button>
      <button
        type="button"
        aria-label="Make preview wider"
        onClick={() => onChange(previewWidth + 4)}
      >
        +
      </button>
    </div>
  );
}

type PreviewResizeHandleProps = {
  previewWidth: number;
  onChange: (value: number) => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function PreviewResizeHandle({
  previewWidth,
  onChange,
  onPointerDown,
}: PreviewResizeHandleProps) {
  return (
    <button
      className="catalog-selector__resizeHandle"
      type="button"
      role="separator"
      aria-label="Resize preview"
      aria-orientation="vertical"
      aria-valuemin={MIN_PREVIEW_WIDTH}
      aria-valuemax={MAX_PREVIEW_WIDTH}
      aria-valuenow={Math.round(previewWidth)}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onChange(previewWidth + 2);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onChange(previewWidth - 2);
        }
        if (event.key === "Home") {
          event.preventDefault();
          onChange(MIN_PREVIEW_WIDTH);
        }
        if (event.key === "End") {
          event.preventDefault();
          onChange(MAX_PREVIEW_WIDTH);
        }
      }}
    >
      <span aria-hidden="true" />
    </button>
  );
}
