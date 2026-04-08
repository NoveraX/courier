/**
 * Store mutation command handlers — create, update, delete, seed.
 */

import { seedAllCollections } from "../../auto/auto-scenario";
import type { BridgeContext } from "../types";

export function handleStoreCreate(
  ctx: BridgeContext,
  collectionName: string,
  record: Record<string, unknown>,
): unknown {
  const col = ctx.server.store.collection(collectionName);
  return col.create(record);
}

export function handleStoreUpdate(
  ctx: BridgeContext,
  collectionName: string,
  id: string | number,
  data: Record<string, unknown>,
): unknown {
  const col = ctx.server.store.collection(collectionName);
  return col.update((q) => q.where({ id } as Record<string, unknown>), { data });
}

export function handleStoreDelete(
  ctx: BridgeContext,
  collectionName: string,
  rawId: string | number,
): boolean {
  const col = ctx.server.store.collection(collectionName);
  if (rawId === "*") {
    col.clear();
    return true;
  }
  const id = parseId(rawId);
  return col.delete((q) => q.where({ id } as Record<string, unknown>));
}

function parseId(raw: string | number): string | number {
  if (typeof raw === "number") return raw;
  const num = Number(raw);
  return Number.isNaN(num) ? raw : num;
}

export function handleStoreSeed(
  ctx: BridgeContext,
  _collectionName: string,
  count: number,
): { seeded: number } {
  seedAllCollections(ctx.analyzedRoutes, ctx.server.store, { seedCount: count });
  return { seeded: count };
}
