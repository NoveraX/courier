/**
 * Dispatch incoming commands from Studio parent to appropriate handlers.
 */

import type { MockServer } from "../server/create-mock-server";
import { answerBodyCommand } from "./body-command";
import type { DescribedRoute } from "./describe-route";
import { handleChaosCommand, handleNetworkCommand } from "./network-commands";
import { restoreNetwork } from "./restore-network";
import { buildScenarioMeta } from "./scenario-meta";
import { handleStoreCommand } from "./store-commands";
import type { ParentMessage, ServedMock } from "./types";
import { send, sendEvent } from "./worker-ipc";

export function handleCommand(
  served: ServedMock,
  msg: Extract<ParentMessage, { type: "command" }>,
  buildUiRoutes: () => DescribedRoute[],
): void {
  const { server, routes: analyzedRoutes, feed } = served;
  const action = msg.command.action;

  if (action === "mock:network:set") {
    const result = handleNetworkCommand(server, msg.command);
    send({ type: "command-result", requestId: msg.requestId, ...result });
    return;
  }
  if (action === "mock:network:restore") {
    send({
      type: "command-result",
      requestId: msg.requestId,
      ...restoreNetwork(server, msg.command),
    });
    return;
  }
  if (action === "mock:chaos:set") {
    const result = handleChaosCommand(server, msg.command);
    send({ type: "command-result", requestId: msg.requestId, ...result });
    return;
  }

  if (action === "mock:request:body") {
    const result = answerBodyCommand(served.bodies, msg.command);
    send({ type: "command-result", requestId: msg.requestId, ...result });
    return;
  }
  /* Studio, whose copy of the store fell out of step with it, asks for it whole. */
  if (action === "mock:store:resend") {
    feed.resend();
    send({ type: "command-result", requestId: msg.requestId, ok: true });
    return;
  }

  const result = handleStoreCommand(served, msg.command);
  if (action === "mock:scenario:apply") {
    emitScenarioApplied(server, analyzedRoutes, result, buildUiRoutes);
  }
  /* A command changes the store outside any request, which reports and
     saves it otherwise: the page that sent it is shown the change at once,
     ahead of the result it waits for. */
  feed.flush();
  send({ type: "command-result", requestId: msg.requestId, ...result });
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

  const updated = buildScenarioMeta(server.scenarios, analyzedRoutes, appliedName);
  sendEvent({
    type: "mock:scenario:active",
    scenario: appliedName,
    scenarios: updated,
    routes: buildUiRoutes(),
  });
}

/* The scenario a successful apply names in its data. */
function appliedScenario(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const applied: unknown = Reflect.get(data, "applied");
  return typeof applied === "string" ? applied : undefined;
}
