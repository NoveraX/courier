import { ChevronRight, Split } from "lucide-react";
import { Fragment, useState } from "react";

import { methodText } from "@/design/method-color";
import { ToggleSwitch } from "@/design/toggle-switch";
import type { OverrideRow } from "@/features/mocks/route-overrides";
import { overrideRows } from "@/features/mocks/route-overrides";
import { cn } from "@/lib/utils";
import { setRouteOverride } from "@/mocks/network-commands";
import type { MockServerInfo } from "@/store/mock-slice";
import { NetworkCard } from "./network-card";
import { RouteOverrideEditor } from "./route-override-editor";

const TAG = {
  err: "bg-err-dim text-err",
  brand: "bg-brand-dim text-brand",
  subtle: "bg-raised text-fg-subtle",
} as const;

function Row({
  row,
  open,
  disabled,
  onOpen,
  onToggle,
}: {
  row: OverrideRow;
  open: boolean;
  disabled: boolean;
  onOpen: () => void;
  onToggle: (on: boolean) => void;
}): React.ReactNode {
  return (
    <div
      className={cn(
        "flex min-h-11.5 items-center gap-3 border-b border-line px-4.5 transition-opacity",
        !row.override.enabled && "opacity-55",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={onOpen}
        className="grid min-w-0 flex-1 cursor-pointer grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-left disabled:cursor-default"
      >
        <span className={cn("font-mono text-meta font-semibold", methodText(row.method))}>
          {row.method}
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-mono text-small">{row.path}</span>
          <span className="truncate text-badge text-fg-subtle">{row.name}</span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-5 items-center rounded-[5px] px-1.75 font-mono text-meta whitespace-nowrap",
              TAG[row.tone],
            )}
          >
            {row.tag}
          </span>
          <ChevronRight
            aria-hidden="true"
            className={cn("size-3 text-fg-subtle transition-transform", open && "rotate-90")}
          />
        </span>
      </button>
      <ToggleSwitch
        label={`Override ${row.name}`}
        checked={row.override.enabled}
        disabled={disabled}
        onChange={onToggle}
      />
    </div>
  );
}

/**
 * The mock's routes, each with a delay and failure rate of its own that
 * take priority over the global settings: switched on and off from its
 * row, set in the editor the row opens.
 *
 * @param props - The mock server, and whether it can take a change
 * @returns The panel
 * @example
 * ```tsx
 * <RouteOverridesPanel server={server} disabled={false} />
 * ```
 */
export function RouteOverridesPanel({
  server,
  disabled,
}: {
  server: MockServerInfo;
  disabled: boolean;
}): React.ReactNode {
  const [open, setOpen] = useState<string | null>(null);
  const rows = overrideRows(server);
  return (
    <NetworkCard
      icon={Split}
      tone="text-syntax-keyword"
      title="Per-route overrides"
      note="take priority over global settings"
    >
      {rows.length === 0 && (
        <p className="px-4.5 py-6 text-center text-control text-fg-subtle">
          The mock serves no routes
        </p>
      )}
      <div className="-mb-px flex flex-col">
        {rows.map((row) => (
          <Fragment key={row.routeId}>
            <Row
              row={row}
              open={open === row.routeId}
              disabled={disabled}
              onOpen={() => setOpen(open === row.routeId ? null : row.routeId)}
              onToggle={(enabled) => setRouteOverride(server, { ...row.override, enabled })}
            />
            {open === row.routeId && !disabled && (
              <RouteOverrideEditor
                override={row.override}
                onCommit={(override) => setRouteOverride(server, override)}
              />
            )}
          </Fragment>
        ))}
      </div>
    </NetworkCard>
  );
}
