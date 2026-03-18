/**
 * Individual endpoint row components for the manage inventory view.
 */

import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MethodBadge } from "@/components/shared/method-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { InventoryEndpoint } from "./types";

// ── Active row ───────────────────────────────────────────────────────────────

export function ActiveRow({ ep, markedForRemoval, onToggle }: {
  ep: InventoryEndpoint;
  markedForRemoval: boolean;
  onToggle: (group: string, name: string, currentlyActive: boolean) => void;
}): React.ReactElement {
  return (
    <EndpointRow
      ep={ep}
      checked={!markedForRemoval}
      onToggle={() => onToggle(ep.group, ep.name, true)}
      badge={ep.modificationStatus === "modified" ? (
        <Badge variant="amber" className="text-[9px]">modified</Badge>
      ) : undefined}
    />
  );
}

// ── Available row ────────────────────────────────────────────────────────────

export function AvailableRow({ ep, markedForAdd, onToggle }: {
  ep: InventoryEndpoint;
  markedForAdd: boolean;
  onToggle: (group: string, name: string, currentlyActive: boolean) => void;
}): React.ReactElement {
  return (
    <EndpointRow
      ep={ep}
      checked={markedForAdd}
      onToggle={() => onToggle(ep.group, ep.name, false)}
      badge={<Badge variant="secondary" className="text-[9px]">new</Badge>}
    />
  );
}

// ── Custom row (display only) ────────────────────────────────────────────────

export function CustomRow({ ep }: { ep: InventoryEndpoint }): React.ReactElement {
  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 opacity-60">
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="size-3 text-zinc-500" />
        </TooltipTrigger>
        <TooltipContent>This endpoint was added manually</TooltipContent>
      </Tooltip>
      <MethodBadge method={ep.httpMethod} className="shrink-0" />
      <span className="text-xs text-foreground font-mono truncate">{ep.name}</span>
      <Badge variant="secondary" className="text-[9px] ml-auto">custom</Badge>
    </div>
  );
}

// ── Removed-from-spec row ────────────────────────────────────────────────────

export function RemovedRow({ ep, markedForRemoval, onToggle }: {
  ep: InventoryEndpoint;
  markedForRemoval: boolean;
  onToggle: (group: string, name: string, currentlyActive: boolean) => void;
}): React.ReactElement {
  return (
    <EndpointRow
      ep={ep}
      checked={!markedForRemoval}
      onToggle={() => onToggle(ep.group, ep.name, true)}
      badge={<Badge variant="rose" className="text-[9px]">removed from spec</Badge>}
    />
  );
}

// ── Base row ─────────────────────────────────────────────────────────────────

function EndpointRow({ ep, checked, onToggle, badge }: {
  ep: InventoryEndpoint;
  checked: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/20 transition-colors cursor-pointer">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="size-3.5"
      />
      <MethodBadge method={ep.httpMethod} className="shrink-0" />
      <span className="text-xs text-foreground font-mono truncate">{ep.name}</span>
      <span className="text-[10px] text-muted-foreground truncate ml-auto mr-2">{ep.path}</span>
      {badge}
    </label>
  );
}
