import { GripVerticalIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DetailPanel } from "@/components/shared/detail-panel";
import type { DetailTabKey } from "@/components/shared/detail-panel/constants";
import { useEscapeClose } from "@/hooks/use-escape-close";
import { useRequestDetail } from "@/hooks/use-request-detail";
import { resizeKeys } from "@/lib/resize-keys";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const ANIMATION_MS = 200;

interface GlobalDetailPanelProps {
  children: React.ReactNode;
}

export function GlobalDetailPanel({ children }: GlobalDetailPanelProps): React.ReactElement {
  const { selectedId, detailTab, setDetailTab, closePanel } = useRequestDetail();
  const requests = useStudioStore((s) => s.requests);
  const selectedRequest = selectedId ? (requests.find((r) => r.id === selectedId) ?? null) : null;

  const isOpen = selectedRequest !== null;

  // Cache last request so panel content stays during slide-out
  const cachedRequest = useRef(selectedRequest);
  useEffect(() => {
    if (selectedRequest) cachedRequest.current = selectedRequest;
  }, [selectedRequest]);

  // Delayed unmount for slide-out animation
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setClosing(false);
        cachedRequest.current = null;
      }, ANIMATION_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen, visible]);

  useEscapeClose(isOpen, closePanel);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>

      {visible && (selectedRequest ?? cachedRequest.current) && (
        <DetailSidebar
          request={(selectedRequest ?? cachedRequest.current)!}
          activeTab={detailTab}
          onTabChange={setDetailTab}
          onClose={closePanel}
          closing={closing}
        />
      )}
    </div>
  );
}

// ── Resizable sidebar overlay ──────────────────────────────────────────────

function DetailSidebar({
  request,
  activeTab,
  onTabChange,
  onClose,
  closing,
}: {
  request: NonNullable<ReturnType<typeof useStudioStore.getState>["requests"][number]>;
  activeTab: DetailTabKey;
  onTabChange: (tab: DetailTabKey) => void;
  onClose: () => void;
  closing: boolean;
}): React.ReactElement {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      let dragRaf = 0;
      const onMouseMove = (ev: MouseEvent): void => {
        if (dragRaf) return;
        dragRaf = requestAnimationFrame(() => {
          const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)));
          if (panelRef.current) panelRef.current.style.width = `${w}px`;
          dragRaf = 0;
        });
      };

      const onMouseUp = (): void => {
        const finalW = panelRef.current ? parseFloat(panelRef.current.style.width) : startWidth;
        setWidth(finalW);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute inset-y-0 right-0 z-20 flex border-l border-border-subtle bg-background shadow-2xl shadow-black/30",
        closing
          ? "animate-out slide-out-to-right duration-200 fill-mode-forwards"
          : "animate-in slide-in-from-right duration-200",
      )}
      style={{ width }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a resize handle is a separator that takes focus and holds a value, which <hr> cannot */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the details panel"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        className="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize"
        onMouseDown={handleMouseDown}
        onKeyDown={resizeKeys(setWidth, {
          size: width,
          min: MIN_WIDTH,
          max: MAX_WIDTH,
          grows: "left",
        })}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-accent-brand group-active:bg-accent-brand" />
        <div className="absolute left-1/2 top-1/2 z-10 flex h-4 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xs border bg-border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        <DetailPanel
          request={request}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
