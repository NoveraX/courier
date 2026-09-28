import type { ExecuteBackend } from "@noverax/courier/internal";
import type { MockRegistry } from "../registry";
import type { MockHistoryEntry, NetworkConfig } from "../types";
import { handleChannel } from "./handle-channel";
import { handleHTTP } from "./handle-http";
import { handleStream } from "./handle-stream";

export interface BackendDeps {
  registry: MockRegistry;
  history: MockHistoryEntry[];
  callCounts: Map<string, number>;
  getScenarioState: () => string;
  setScenarioState: (state: string) => void;
  network?: NetworkConfig;
}

/** Create the ExecuteBackend that powers mock client's dot-notation proxy */
export function createMockBackend(deps: BackendDeps): ExecuteBackend {
  const { registry, history, callCounts } = deps;
  const callKey = (group: string, method: string) => `${group}/${method}`;

  return (group, method, variables) => {
    const key = callKey(group, method);
    const index = callCounts.get(key) ?? 0;
    callCounts.set(key, index + 1);
    const handler = registry.get(group, method, deps.getScenarioState());

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
      network: deps.network,
      getScenarioState: deps.getScenarioState,
      setScenarioState: deps.setScenarioState,
    });
  };
}
