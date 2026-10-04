/**
 * "Handler" tab of the mock route detail panel: whether the handler is
 * auto-generated or a custom override, with a card that explains which.
 */

import { Code2 } from "lucide-react";
import { DetailRow, DetailSection } from "@/components/shared/detail-panel/detail-rows";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MockRouteEntry } from "@/store/mock-slice";
import { inferOperation } from "./route-detail-helpers";

export function HandlerTab({ route }: { route: MockRouteEntry }): React.ReactElement {
  const isAuto = route.source === "auto";

  return (
    <div className="space-y-5 p-4">
      <DetailSection title="Handler Info">
        <DetailRow label="Type">
          <Badge variant={isAuto ? "secondary" : "amber"}>
            {isAuto ? "Auto-generated" : "Custom override"}
          </Badge>
        </DetailRow>
        <DetailRow label="Operation">
          <span className="font-mono">{inferOperation(route)}</span>
        </DetailRow>
      </DetailSection>

      <div
        className={cn(
          "rounded-lg border p-4",
          isAuto ? "border-border-subtle bg-muted/10" : "border-amber-500/20 bg-amber-500/5",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              isAuto ? "bg-muted/30" : "bg-amber-500/10",
            )}
          >
            <Code2 className={cn("size-4", isAuto ? "text-muted-foreground" : "text-amber-400")} />
          </div>
          <p className="text-body-sm leading-relaxed text-foreground/80">
            {isAuto
              ? "This route is auto-generated from your API source definition. Override it by defining a custom handler in your mock server."
              : "This route uses a custom handler defined in your mock server configuration."}
          </p>
        </div>
      </div>
    </div>
  );
}
