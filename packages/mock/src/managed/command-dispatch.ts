/**
 * Dispatch incoming commands from Studio parent to appropriate handlers.
 */

import type { MockServer } from "../server/create-mock-server";
import type { DescribedRoute } from "./describe-route";
import { handleChaosCommand, handleNetworkCommand } from "./network-commands";
import { buildScenarioMeta } from "./scenario-meta";
import { handleStoreCommand } from "./store-commands";
import type { ChildScenarioMeta, ParentMessage, ServedMock } from "./types";
import { send, sendStoreSnapshot } from "./worker-ipc";

export function handleCommand(
  served: ServedMock,
  msg: Extract<ParentMessage, { type: "command" }>,
  buildUiRoutes: () => DescribedRoute[],
): void {
  const { server, routes: analyzedRoutes } = served;
  const action = msg.command.action;

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

  const result = handleStoreCommand(served, msg.command);
  send({ type: "command-result", requestId: msg.requestId, ...result });

  if (action === "mock:scenario:apply") {
    emitScenarioApplied(server, analyzedRoutes, result, buildUiRoutes);
  } else {
    sendStoreSnapshot(server);
  }
  /* A command changes the store outside any request, which saves it otherwise. */
  void server.saveStore();
}

function emitScenarioApplied(
  server: MockServer,
  analyzedRoutes: ServedMock["routes"],
  result: { ok: boolean; data?: unknown },
  buildUiRoutes: () => DescribedRoute[],
): void {
  const appliedName = appliedScenario(result.data);
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

/* The scenario a successful apply names in its data. */
function appliedScenario(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const applied: unknown = Reflect.get(data, "applied");
  return typeof applied === "string" ? applied : undefined;
}
