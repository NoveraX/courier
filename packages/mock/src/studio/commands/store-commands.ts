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
  return col.updateById(id, data);
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
  return col.deleteById(rawId);
}

export function handleStoreSeed(
  ctx: BridgeContext,
  _collectionName: string,
  count: number,
): { seeded: number } {
  seedAllCollections(ctx.analyzedRoutes, ctx.server.store, { seedCount: count });
  return { seeded: count };
}
