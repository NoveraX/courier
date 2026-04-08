import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MethodBadge } from "@/components/shared/method-badge";
import type { RequestEntry } from "@/store/types";

export function PanelHeader({
  request,
  onClose,
}: {
  request: RequestEntry;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border-subtle px-3">
      <div className="flex items-center gap-2 min-w-0">
        <MethodBadge method={request.httpMethod ?? "GET"} />
        <span className="truncate mono-sm text-foreground">
          {request.group ? `${request.group}.` : ""}
          {request.method}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onClose}
        aria-label="Close panel"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
