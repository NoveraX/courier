import { methodText } from "@/design/method-color";
import { TickBox } from "@/design/tick-box";
import { endpointLabel } from "@/features/apis/group-label";
import type { InventoryEndpoint } from "@/features/apis/types";
import { cn } from "@/lib/utils";

const TAG: Readonly<Record<string, { label: string; className: string }>> = {
  available: { label: "New", className: "bg-ok-dim text-ok" },
  "removed-from-spec": { label: "Removed from spec", className: "bg-err-dim text-err" },
  modified: { label: "Edited", className: "bg-warn-dim text-warn" },
  custom: { label: "Custom", className: "bg-raised text-fg-subtle" },
};

/* What happens to an endpoint the user does not pick for, by its status. */
const FIXED: Readonly<Partial<Record<InventoryEndpoint["status"], string>>> = {
  custom: "Added by hand — Studio leaves it as it is",
  "removed-from-spec": "The spec no longer has it, so it goes with the update; Studio keeps a copy",
};

function tagOf(ep: InventoryEndpoint): { label: string; className: string } | undefined {
  if (ep.status === "active")
    return ep.modificationStatus === "modified" ? TAG.modified : undefined;
  return TAG[ep.status];
}

interface InventoryRowProps {
  group: string;
  endpoint: InventoryEndpoint;
  /** Whether it is kept: ticked, or added by hand. */
  on: boolean;
  onToggle: (group: string, name: string, currentlyActive: boolean) => void;
}

/**
 * One endpoint of the Endpoints step: its method, name and path, what
 * changed about it — new, removed from the spec, edited or added by hand —
 * and a tick box, unless Studio decides for it: one added by hand stays,
 * one the spec dropped goes with the update.
 *
 * @param props - Its group, the endpoint, whether it is kept, and what ticking does
 * @returns The row
 * @example
 * ```tsx
 * <InventoryRow group="users" endpoint={endpoint} on onToggle={toggle} />
 * ```
 */
export function InventoryRow({
  group,
  endpoint: ep,
  on,
  onToggle,
}: InventoryRowProps): React.ReactNode {
  const tag = tagOf(ep);
  const row = cn(
    "grid min-h-10 grid-cols-[15px_44px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-line px-3",
    !on && "opacity-55",
  );
  const body = (
    <>
      <span
        className={cn(
          "font-mono text-meta font-semibold uppercase",
          methodText(ep.httpMethod.toUpperCase()),
        )}
      >
        {ep.httpMethod}
      </span>
      <span className="flex min-w-0 items-baseline gap-2.5 overflow-hidden whitespace-nowrap">
        <span className="font-mono text-small">{ep.name}</span>
        <span className="truncate font-mono text-badge text-fg-subtle">{ep.path}</span>
      </span>
      {tag ? (
        <span
          className={cn(
            "flex h-4.75 items-center rounded-[5px] px-1.75 text-meta font-semibold whitespace-nowrap",
            tag.className,
          )}
        >
          {tag.label}
        </span>
      ) : (
        <span />
      )}
    </>
  );
  const fixed = FIXED[ep.status];
  if (fixed !== undefined)
    return (
      <div title={fixed} className={row}>
        <span />
        {body}
      </div>
    );
  return (
    <label className={cn(row, "cursor-pointer hover:bg-raised")}>
      <TickBox
        checked={on}
        label={`Keep ${endpointLabel(group, ep.name)}`}
        onChange={() => onToggle(group, ep.name, ep.status !== "available")}
      />
      {body}
    </label>
  );
}
