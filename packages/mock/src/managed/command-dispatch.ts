/**
 * Dispatch incoming commands from Studio parent to appropriate handlers.
 */

import type { RouteInfo } from "../auto/route-analyzer";
import type { MockServer } from "../server/create-mock-server";
import type { DescribedRoute } from "./describe-route";
import { handleChaosCommand, handleNetworkCommand } from "./network-commands";
import { buildScenarioMeta } from "./scenario-meta";
import { handleStoreCommand } from "./store-commands";
import type { ChildScenarioMeta, ParentMessage } from "./types";
import { send, sendStoreSnapshot } from "./worker-ipc";

export async function handleCommand(
  server: MockServer,
  analyzedRoutes: RouteInfo[],
  msg: Extract<ParentMessage, { type: "command" }>,
  buildUiRoutes: () => DescribedRoute[],
): Promise<void> {
  const action = (msg.command as Record<string, unknown>).action as string;

  if (action === "mock:network:set") {
    const result = handleNetworkCommand(server, msg.command);
    send({ type: "command-result", requestId: msg.requestId, ...result });
    return;
  }
  if (action === "mock:chaos:set") {
    const result = handleChaosCommand(server, msg.command);
    send({ type: "command-result", requestId: msg.requestId, ...result });
    return;
  }

  const result = await handleStoreCommand(server, analyzedRoutes, msg.command);
  send({ type: "command-result", requestId: msg.requestId, ...result });

  if (action === "mock:scenario:apply") {
    emitScenarioApplied(server, analyzedRoutes, result, buildUiRoutes);
  } else {
    sendStoreSnapshot(server);
  }
}

function emitScenarioApplied(
  server: MockServer,
  analyzedRoutes: RouteInfo[],
  result: { ok: boolean; data?: unknown },
  buildUiRoutes: () => DescribedRoute[],
): void {
  const appliedName = (result.data as Record<string, unknown> | undefined)?.applied as
    | string
    | undefined;
  if (!appliedName) return;

  const updated = buildScenarioMeta(server.scenarios, analyzedRoutes).map(
    (s: ChildScenarioMeta) => ({ ...s, isActive: s.name === appliedName }),
  );
  send({
    type: "event",
    event: {
      type: "mock:scenario:active",
      scenario: appliedName,
      scenarios: updated,
      routes: buildUiRoutes(),
    },
  });
}
