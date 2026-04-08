/**
 * Lifecycle command handlers — scenario activation and full server
 * reset. These mutate session-level state and trigger UI refreshes
 * via the event emitter.
 */

import type { MockEventEmitter } from "../event-emitter";
import type { BridgeContext } from "../types";
import { serializeConfig } from "./network-helpers";

export async function handleScenarioApply(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
  scenarioName: string,
): Promise<{ applied: string }> {
  const url = `${ctx.url}/__admin/scenarios/${encodeURIComponent(scenarioName)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to apply scenario "${scenarioName}"`);
  ctx.activeScenario = scenarioName;
  emitter.emitScenarioActive(scenarioName);
  return { applied: scenarioName };
}

export function handleServerReset(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
): { reset: boolean } {
  ctx.server.store.reset();
  ctx.reseed?.();
  ctx.server.history.length = 0;
  ctx.requestCounter = 0;
  ctx.server.networkState.setConfig(undefined);
  emitter.emitNetworkConfig(serializeConfig(ctx.server.networkState));
  return { reset: true };
}
