import { Sheet, SheetContent } from "@/components/ui/sheet";
import { parseEndpointKey } from "../helpers";
import { PanelContent } from "./panel-content";

// ── Props ────────────────────────────────────────────────────────────────────

interface EndpointPanelProps {
  selectedKey: string | null;
  onClose: () => void;
  onNavigateToTimeline?: (requestId: string) => void;
  onOpenPlayground?: (source: string, group: string, method: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function EndpointPanel({
  selectedKey,
  onClose,
  onNavigateToTimeline,
  onOpenPlayground,
}: EndpointPanelProps): React.ReactElement {
  const isOpen = selectedKey !== null;
  const parsed = selectedKey ? parseEndpointKey(selectedKey) : null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[480px] sm:max-w-[480px] border-l border-border-subtle bg-background/95 backdrop-blur-md p-0"
      >
        {parsed && (
          <PanelContent
            source={parsed.source}
            group={parsed.group}
            method={parsed.method}
            onNavigateToTimeline={onNavigateToTimeline}
            onOpenPlayground={onOpenPlayground}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
