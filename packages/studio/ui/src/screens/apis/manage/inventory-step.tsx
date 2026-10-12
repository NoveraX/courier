import { AlertTriangle } from "lucide-react";
import { TickBox } from "@/design/tick-box";
import { groupLabel, TOP_LEVEL } from "@/features/apis/group-label";
import type { EndpointInventory, InventoryEndpoint, InventoryGroup } from "@/features/apis/types";
import { ownValue } from "@/lib/own-value";
import { cn } from "@/lib/utils";
import { InventoryRow } from "./inventory-row";

/* An endpoint kept is ticked: an active one not marked to remove, a new one marked to add.
   One the spec dropped goes with the update, and one added by hand stays: neither is picked. */
function kept(
  ep: InventoryEndpoint,
  toAdd: ReadonlySet<string>,
  toRemove: ReadonlySet<string>,
): boolean {
  if (ep.status === "custom") return true;
  if (ep.status === "removed-from-spec") return false;
  return ep.status === "available" ? toAdd.has(ep.name) : !toRemove.has(ep.name);
}

const pickable = (ep: InventoryEndpoint): boolean =>
  ep.status === "active" || ep.status === "available";

interface InventoryStepProps {
  inventory: EndpointInventory;
  toAdd: Record<string, Set<string>>;
  toRemove: Record<string, Set<string>>;
  onToggle: (group: string, name: string, currentlyActive: boolean) => void;
  onToggleGroup: (group: string) => void;
  onToggleAll: () => void;
}

function Group({
  group,
  toAdd,
  toRemove,
  onToggle,
  onToggleGroup,
}: { group: InventoryGroup; toAdd: ReadonlySet<string>; toRemove: ReadonlySet<string> } & Pick<
  InventoryStepProps,
  "onToggle" | "onToggleGroup"
>): React.ReactNode {
  const toggleable = group.endpoints.filter(pickable);
  const ticked = toggleable.filter((ep) => kept(ep, toAdd, toRemove)).length;
  const top = group.name === TOP_LEVEL;
  return (
    <section
      aria-label={top ? "Top-level endpoints" : `Group ${group.name}`}
      className="overflow-hidden rounded-[11px] border border-line"
    >
      <div className="flex h-9.5 items-center gap-2.5 bg-panel-subtle px-3">
        {!group.isCustomGroup && toggleable.length > 0 && (
          <TickBox
            checked={ticked === toggleable.length}
            mixed={ticked > 0 && ticked < toggleable.length}
            label={`Keep ${groupLabel(group.name)}`}
            onChange={() => onToggleGroup(group.name)}
          />
        )}
        <span className={cn("text-control font-semibold", !top && "font-mono")}>
          {groupLabel(group.name)}
        </span>
        {top && <span className="text-label text-fg-subtle">in no group</span>}
        <span className="text-label text-fg-subtle">
          {group.isCustomGroup ? "custom group" : `${ticked}/${toggleable.length}`}
        </span>
      </div>
      {group.endpoints.map((ep) => (
        <InventoryRow
          key={ep.name}
          group={group.name}
          endpoint={ep}
          on={kept(ep, toAdd, toRemove)}
          onToggle={onToggle}
        />
      ))}
    </section>
  );
}

/**
 * The Endpoints step: what the import holds and what its spec offers — the
 * endpoints it generates, the new ones, the ones the spec dropped, the
 * ones edited or added by hand — each kept or not.
 *
 * @param props - The inventory, the endpoints marked to add and to remove, and what ticking does
 * @returns The step
 * @example
 * ```tsx
 * <InventoryStep inventory={inventory} toAdd={toAdd} toRemove={toRemove} onToggle={toggle} onToggleGroup={toggleGroup} onToggleAll={toggleAll} />
 * ```
 */
export function InventoryStep({
  inventory,
  toAdd,
  toRemove,
  onToggle,
  onToggleGroup,
  onToggleAll,
}: InventoryStepProps): React.ReactNode {
  const removed = inventory.groups.reduce(
    (n, g) => n + g.endpoints.filter((ep) => ep.status === "removed-from-spec").length,
    0,
  );
  const toggleable = inventory.groups.flatMap((g) =>
    g.endpoints.filter(pickable).map((ep) => ({ ep, group: g.name })),
  );
  const all =
    toggleable.length > 0 &&
    toggleable.every(({ ep, group }) =>
      kept(ep, ownValue(toAdd, group) ?? new Set(), ownValue(toRemove, group) ?? new Set()),
    );
  const figures = [
    { label: "Generated", value: inventory.totalActive, tone: "text-fg" },
    {
      label: "New",
      value: inventory.totalAvailable,
      tone: inventory.totalAvailable ? "text-ok" : "text-fg-subtle",
    },
    { label: "Removed from spec", value: removed, tone: removed ? "text-err" : "text-fg-subtle" },
    { label: "Custom", value: inventory.totalCustom, tone: "text-fg-subtle" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-panel border border-line bg-line max-sm:grid-cols-2">
        {figures.map((f) => (
          <div key={f.label} className="flex flex-col gap-0.75 bg-inset px-3 py-2.25">
            <span className="text-meta text-fg-subtle">{f.label}</span>
            <span className={cn("font-mono text-prompt font-medium", f.tone)}>{f.value}</span>
          </div>
        ))}
      </div>
      {inventory.specChanged && (
        <p className="m-0 flex items-center gap-2 rounded-panel bg-warn-dim px-3 py-2.5 text-small text-warn">
          <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
          The spec changed since it was imported. Studio generates the endpoints you keep from it
          afresh, keeping your edits; tick new ones to add them. Those it no longer has go.
        </p>
      )}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onToggleAll}
          className="flex h-6.5 cursor-pointer items-center rounded-[6px] border border-line px-2.25 text-small text-fg-muted hover:border-line-strong hover:text-fg pointer-coarse:h-9 pointer-coarse:px-2.5"
        >
          {all ? "Deselect all" : "Select all"}
        </button>
      </div>
      {inventory.groups.map((group) => (
        <Group
          key={group.name}
          group={group}
          toAdd={ownValue(toAdd, group.name) ?? new Set()}
          toRemove={ownValue(toRemove, group.name) ?? new Set()}
          onToggle={onToggle}
          onToggleGroup={onToggleGroup}
        />
      ))}
    </div>
  );
}
