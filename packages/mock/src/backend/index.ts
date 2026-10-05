import type { ExecuteBackend } from "@noverax/courier/internal";
import { routeConfigOf } from "../network/config-shape";
import type { MockRegistry } from "../registry";
import type { ScenarioMark } from "../scenario/scenario-state";
import type { MockHistoryEntry, NetworkConfig } from "../types";
import { handleChannel } from "./handle-channel";
import { handleHTTP } from "./handle-http";
import { handleStream } from "./handle-stream";

export interface BackendDeps {
  registry: MockRegistry;
  history: MockHistoryEntry[];
  callCounts: Map<string, number>;
  getScenarioState: () => string;
  markScenario: () => ScenarioMark;
  transitionScenario: (from: ScenarioMark, to: string) => void;
  network?: NetworkConfig | undefined;
}

/** Create the ExecuteBackend that powers mock client's dot-notation proxy */
export function createMockBackend(deps: BackendDeps): ExecuteBackend {
  const { registry, history, callCounts } = deps;
  const callKey = (group: string, method: string) => `${group}/${method}`;

  return (group, method, variables) => {
    const key = callKey(group, method);
    const index = callCounts.get(key) ?? 0;
    callCounts.set(key, index + 1);
    const mark = deps.markScenario();
    const handler = registry.get(group, method, mark.state);

    if (handler?.transport === "sse" && handler.streamFn) {
      return handleStream(group, method, variables, handler, index, history, deps.getScenarioState);
    }
    if (handler?.transport === "ws" && handler.channelFn) {
      return handleChannel(
        group,
        method,
        variables,
        handler,
        index,
        history,
        deps.getScenarioState,
      );
    }

    return handleHTTP({
      group,
      method,
      variables,
      handler,
      index,
      history,
      network: deps.network && routeConfigOf(deps.network, group, method),
      getScenarioState: deps.getScenarioState,
      mark,
      transitionScenario: deps.transitionScenario,
    });
  };
}
