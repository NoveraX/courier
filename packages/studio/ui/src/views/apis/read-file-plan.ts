import { isPlainObject } from "@/socket/is-plain-object";

import type { FileOwnership, FilePlanSummary, KeptReason, PlanConfirmation, PlannedWriteAction } from "./types-file-plan";

type Item = Record<string, unknown>;

const OWNERSHIPS = [
  "absent", "recorded", "recorded-edited", "claimed", "claimed-edited", "foreign", "link", "not-a-file",
] as const satisfies readonly FileOwnership[];
const ACTIONS = ["create", "replace", "merge", "unchanged"] as const satisfies readonly PlannedWriteAction[];
const KEPT = ["not-written-by-studio", "link", "not-a-file", "unconfirmed", "imported"] as const satisfies readonly KeptReason[];
const KINDS = ["replace", "remove"] as const;
const REASONS = ["edited", "claimed", "foreign"] as const;
const BLOCKED = ["link", "not-a-file"] as const;

function oneOf<TValue extends string>(values: readonly TValue[], raw: unknown): TValue | undefined {
  return values.find((value) => value === raw);
}

function isPath(raw: unknown): raw is string {
  return typeof raw === "string" && raw !== "";
}

/* Every item read, or nothing when any item is malformed: a plan shown in part would misstate it. */
function listOf<TItem>(raw: unknown, read: (item: Item, path: string) => TItem | undefined): TItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: TItem[] = [];
  for (const item of raw) {
    const value = isPlainObject(item) && isPath(item.path) ? read(item, item.path) : undefined;
    if (value === undefined) return undefined;
    items.push(value);
  }
  return items;
}

function readWrite(item: Item, path: string): FilePlanSummary["writes"][number] | undefined {
  const action = oneOf(ACTIONS, item.action);
  const was = oneOf(OWNERSHIPS, item.was);
  return action && was ? { path, action, was } : undefined;
}

function readRemoval(item: Item, path: string): FilePlanSummary["removals"][number] | undefined {
  const was = oneOf(OWNERSHIPS, item.was);
  return was ? { path, was } : undefined;
}

function readKept(item: Item, path: string): FilePlanSummary["kept"][number] | undefined {
  const reason = oneOf(KEPT, item.reason);
  return reason ? { path, reason } : undefined;
}

function readBlocked(item: Item, path: string): FilePlanSummary["blocked"][number] | undefined {
  const reason = oneOf(BLOCKED, item.reason);
  return reason ? { path, reason } : undefined;
}

function readConfirmation(item: Item, path: string): PlanConfirmation | undefined {
  const kind = oneOf(KINDS, item.kind);
  const reason = oneOf(REASONS, item.reason);
  if (!kind || !reason || typeof item.preselected !== "boolean") return undefined;
  return { path, kind, reason, preselected: item.preselected };
}

function readPaths(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const paths = raw.filter(isPath);
  return paths.length === raw.length ? paths : undefined;
}

/**
 * Read a file plan from Studio's answer. Every field is checked, and a plan
 * with any malformed part is not read at all, since showing part of a plan
 * would misstate what applying it does.
 *
 * @param raw - The `plan` of Studio's answer
 * @returns The plan, or `null` when it is not one
 * @example
 * ```ts
 * readFilePlan(reply.plan)?.pending; // → [{ path: "src/api/pets/index.ts", kind: "replace", reason: "foreign", preselected: false }]
 * ```
 */
export function readFilePlan(raw: unknown): FilePlanSummary | null {
  if (!isPlainObject(raw) || !isPath(raw.digest) || typeof raw.dir !== "string") return null;
  const writes = listOf(raw.writes, readWrite);
  const removals = listOf(raw.removals, readRemoval);
  const kept = listOf(raw.kept, readKept);
  const pending = listOf(raw.pending, readConfirmation);
  const blocked = listOf(raw.blocked, readBlocked);
  const forgotten = readPaths(raw.forgotten);
  if (!writes || !removals || !kept || !pending || !blocked || !forgotten) return null;
  return { digest: raw.digest, dir: raw.dir, writes, removals, kept, pending, blocked, forgotten };
}
