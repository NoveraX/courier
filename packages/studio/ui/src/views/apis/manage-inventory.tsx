/**
 * Inventory view — shows all endpoints organized by status sections.
 *
 * Active: pre-checked, uncheck to remove.
 * Available: unchecked, check to add.
 * Custom/removed-from-spec: display only.
 */

import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import type { EndpointInventory, InventoryGroup } from "./types";
import { ActiveRow, AvailableRow, CustomRow, RemovedRow } from "./manage-endpoint-rows";
import { ownValue } from "@/lib/own-value";

interface ManageInventoryProps {
  inventory: EndpointInventory;
  toAdd: Record<string, Set<string>>;
  toRemove: Record<string, Set<string>>;
  onToggle: (group: string, name: string, currentlyActive: boolean) => void;
  onToggleGroup: (groupName: string) => void;
  onToggleAll: () => void;
}

export function ManageInventoryView({
  inventory, toAdd, toRemove, onToggle, onToggleGroup, onToggleAll,
}: ManageInventoryProps): React.ReactElement {
  const { selectedCount, totalToggleable } = countSelection(inventory, toAdd, toRemove);
  const allSelected = selectedCount === totalToggleable && totalToggleable > 0;

  return (
    <div className="space-y-4 pt-2">
      {inventory.specChanged && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Spec has changed — {inventory.totalAvailable} new endpoints available
          </p>
        </div>
      )}

      {/* Header with counter + select all */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="text-emerald-400">{inventory.totalActive} active</span>
          <span>·</span>
          <span className="text-blue-400">{inventory.totalAvailable} available</span>
          <span>·</span>
          <span className="text-zinc-500">{inventory.totalCustom} custom</span>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onToggleAll}>
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
      </div>

      <div className="space-y-3">
        {inventory.groups.map((group) => (
          <GroupSection
            key={group.name}
            group={group}
            toAdd={ownValue(toAdd, group.name) ?? new Set()}
            toRemove={ownValue(toRemove, group.name) ?? new Set()}
            onToggle={onToggle}
            onToggleGroup={onToggleGroup}
          />
        ))}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function countSelection(
  inventory: EndpointInventory,
  toAdd: Record<string, Set<string>>,
  toRemove: Record<string, Set<string>>,
): { selectedCount: number; totalToggleable: number } {
  let selected = 0;
  let total = 0;

  for (const group of inventory.groups) {
    for (const ep of group.endpoints) {
      if (ep.status === "custom") continue;
      total++;
      if (ep.status === "active" || ep.status === "removed-from-spec") {
        if (!ownValue(toRemove, group.name)?.has(ep.name)) selected++;
      } else if (ep.status === "available") {
        if (ownValue(toAdd, group.name)?.has(ep.name)) selected++;
      }
    }
  }

  return { selectedCount: selected, totalToggleable: total };
}

function getGroupCheckState(
  group: InventoryGroup,
  toAdd: Set<string>,
  toRemove: Set<string>,
): boolean | "indeterminate" {
  const toggleable = group.endpoints.filter((e) => e.status !== "custom");
  if (toggleable.length === 0) return false;

  let checked = 0;
  for (const ep of toggleable) {
    if (ep.status === "active" || ep.status === "removed-from-spec") {
      if (!toRemove.has(ep.name)) checked++;
    } else if (ep.status === "available") {
      if (toAdd.has(ep.name)) checked++;
    }
  }

  if (checked === 0) return false;
  if (checked === toggleable.length) return true;
  return "indeterminate";
}

// ── Group section ────────────────────────────────────────────────────────────

function GroupSection({ group, toAdd, toRemove, onToggle, onToggleGroup }: {
  group: InventoryGroup;
  toAdd: Set<string>;
  toRemove: Set<string>;
  onToggle: (group: string, name: string, currentlyActive: boolean) => void;
  onToggleGroup: (groupName: string) => void;
}): React.ReactElement {
  const active = group.endpoints.filter((e) => e.status === "active");
  const available = group.endpoints.filter((e) => e.status === "available");
  const custom = group.endpoints.filter((e) => e.status === "custom");
  const removed = group.endpoints.filter((e) => e.status === "removed-from-spec");
  const checkState = getGroupCheckState(group, toAdd, toRemove);
  const toggleableCount = group.endpoints.filter((e) => e.status !== "custom").length;

  return (
    <div className="rounded-lg border border-border-subtle overflow-hidden">
      {/* Group header with checkbox */}
      <label className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
        {!group.isCustomGroup && toggleableCount > 0 && (
          <Checkbox
            checked={checkState}
            onCheckedChange={() => onToggleGroup(group.name)}
            className="size-3.5"
          />
        )}
        <span className="text-xs font-semibold text-foreground">{group.name}</span>
        {group.prefix && (
          <span className="text-[10px] text-muted-foreground font-mono">{group.prefix}</span>
        )}
        <Badge variant="secondary" className="text-[10px] ml-auto">
          {group.isCustomGroup ? "custom group" : `${group.endpoints.length}`}
        </Badge>
      </label>

      <div className="divide-y divide-border-subtle">
        {active.map((ep) => (
          <ActiveRow key={ep.name} ep={ep} markedForRemoval={toRemove.has(ep.name)} onToggle={onToggle} />
        ))}
        {available.map((ep) => (
          <AvailableRow key={ep.name} ep={ep} markedForAdd={toAdd.has(ep.name)} onToggle={onToggle} />
        ))}
        {custom.map((ep) => (
          <CustomRow key={ep.name} ep={ep} />
        ))}
        {removed.map((ep) => (
          <RemovedRow key={ep.name} ep={ep} markedForRemoval={toRemove.has(ep.name)} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}
