/**
 * Command dispatcher — routes a typed MockCommand to the matching
 * handler module. Pure switch with no I/O of its own.
 */

import type { MockEventEmitter } from "../event-emitter";
import type { BridgeContext, MockCommand } from "../types";
import { handleScenarioApply, handleServerReset } from "./lifecycle-commands";
import { handleChaosSet, handleNetworkSet } from "./network-commands";
import {
  handleStoreCreate,
  handleStoreDelete,
  handleStoreSeed,
  handleStoreUpdate,
} from "./store-commands";

/** Actions that mutate store data and require a snapshot push */
export const STORE_MUTATIONS = new Set([
  "mock:store:create",
  "mock:store:update",
  "mock:store:delete",
  "mock:store:seed",
  "mock:server:reset",
]);

export async function dispatchCommand(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
  cmd: MockCommand,
): Promise<unknown> {
  switch (cmd.action) {
    case "mock:store:create":
      return handleStoreCreate(ctx, cmd.collection, cmd.record);
    case "mock:store:update":
      return handleStoreUpdate(ctx, cmd.collection, cmd.id, cmd.data);
    case "mock:store:delete":
      return handleStoreDelete(ctx, cmd.collection, cmd.id);
    case "mock:store:seed":
      return handleStoreSeed(ctx, cmd.collection, cmd.count);
    case "mock:scenario:apply":
      return handleScenarioApply(ctx, emitter, cmd.scenario);
    case "mock:network:set":
      return handleNetworkSet(ctx, emitter, cmd);
    case "mock:chaos:set":
      return handleChaosSet(ctx, emitter, cmd);
    case "mock:server:reset":
      return handleServerReset(ctx, emitter);
    default:
      throw new Error(`Unknown command: ${(cmd as { action: string }).action}`);
  }
}
