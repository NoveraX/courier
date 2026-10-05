import { AlertTriangle } from "lucide-react";

import { methodText } from "@/design/method-color";
import type { EndpointInventory, InventoryEndpoint, InventoryGroup } from "@/features/apis/types";
import { ownValue } from "@/lib/own-value";
import { cn } from "@/lib/utils";
import { TickBox } from "../import/tick-box";

const TAG: Readonly<Record<string, { label: string; className: string }>> = {
  available: { label: "New", className: "bg-ok-dim text-ok" },
  "removed-from-spec": { label: "Removed from spec", className: "bg-err-dim text-err" },
  modified: { label: "Edited", className: "bg-warn-dim text-warn" },
  custom: { label: "Custom", className: "bg-raised text-fg-subtle" },
};

/* An endpoint kept is ticked: an active one not marked to remove, a new one marked to add. */
function kept(
  ep: InventoryEndpoint,
  toAdd: ReadonlySet<string>,
  toRemove: ReadonlySet<string>,
): boolean {
  return ep.status === "available" ? toAdd.has(ep.name) : !toRemove.has(ep.name);
}

function tagOf(ep: InventoryEndpoint): { label: string; className: string } | undefined {
  if (ep.status === "active")
    return ep.modificationStatus === "modified" ? TAG.modified : undefined;
  return TAG[ep.status];
}

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
  const toggleable = group.endpoints.filter((ep) => ep.status !== "custom");
  const ticked = toggleable.filter((ep) => kept(ep, toAdd, toRemove)).length;
  return (
    <section
      aria-label={`Group ${group.name}`}
      className="overflow-hidden rounded-[11px] border border-line"
    >
      <div className="flex h-9.5 items-center gap-2.5 bg-panel-subtle px-3">
        {!group.isCustomGroup && toggleable.length > 0 && (
          <TickBox
            checked={ticked === toggleable.length}
            mixed={ticked > 0 && ticked < toggleable.length}
            label={`Keep ${group.name}`}
            onChange={() => onToggleGroup(group.name)}
          />
        )}
        <span className="font-mono text-control font-semibold">{group.name}</span>
        <span className="text-label text-fg-subtle">
          {group.isCustomGroup ? "custom group" : `${ticked}/${toggleable.length}`}
        </span>
      </div>
      {group.endpoints.map((ep) => {
        const tag = tagOf(ep);
        const on = ep.status === "custom" || kept(ep, toAdd, toRemove);
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
        if (ep.status === "custom")
          return (
            <div key={ep.name} title="Added by hand — Studio leaves it as it is" className={row}>
              <span />
              {body}
            </div>
          );
        return (
          <label key={ep.name} className={cn(row, "cursor-pointer hover:bg-raised")}>
            <TickBox
              checked={on}
              label={`Keep ${group.name}.${ep.name}`}
              onChange={() => onToggle(group.name, ep.name, ep.status !== "available")}
            />
            {body}
          </label>
        );
      })}
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
    g.endpoints.filter((ep) => ep.status !== "custom").map((ep) => ({ ep, group: g.name })),
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
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-panel border border-line bg-line">
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
          The spec changed since it was imported — tick the new endpoints to add them.
        </p>
      )}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onToggleAll}
          className="flex h-6.5 cursor-pointer items-center rounded-[6px] border border-line px-2.25 text-small text-fg-muted hover:border-line-strong hover:text-fg"
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
