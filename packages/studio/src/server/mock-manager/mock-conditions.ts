import type { MockConditionsStore } from "../storage/mock-conditions-store";
import type { CommandReply } from "./command-replies";
import type { ServerState } from "./types";

/** What keeps and restores the conditions set on Studio's mocks. */
export interface ConditionsKeeper {
  /** Keep a mock's conditions as they are now. */
  keep(serverId: string): void;
  /** Set the kept conditions on a mock that started again; forget them when its file declares other ones. */
  restore(serverId: string): void;
}

/* A mock's network conditions as it reports them: settings and presets together. */
function networkOf(state: ServerState): Record<string, unknown> | null {
  return state.networkConfig ?? null;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Keep the conditions set on Studio's mocks — the network conditions and
 * the scenario applied — as each mock reports them, and set them again on a
 * mock that starts again: after a restart of the mock, or of Studio. They
 * hold while the mocks file declares the network conditions it declared
 * when they were set: a file that declares other ones is the newer word, and
 * the kept ones are forgotten.
 *
 * @param servers - The mocks Studio runs
 * @param store - Where the conditions are kept
 * @param send - Sends a command to a mock's worker
 * @returns The keeper
 * @example
 * ```ts
 * const conditions = keepConditions(servers, stores.mockConditions, processManager.sendCommand);
 * conditions.restore("shop");
 * ```
 */
export function keepConditions(
  servers: ReadonlyMap<string, ServerState>,
  store: MockConditionsStore,
  send: (serverId: string, command: Record<string, unknown>) => Promise<CommandReply>,
): ConditionsKeeper {
  return {
    keep(serverId) {
      const state = servers.get(serverId);
      if (state?.declaredNetwork === undefined) return;
      store.write(state.mockKey, {
        declared: state.declaredNetwork,
        network: networkOf(state),
        scenario: state.activeScenario,
      });
    },
    restore(serverId) {
      const state = servers.get(serverId);
      const kept = state && store.read(state.mockKey);
      if (!state || !kept) return;
      if (kept.declared !== state.declaredNetwork) return store.forget(state.mockKey);
      if (!same(kept.network, networkOf(state))) {
        const config = kept.network;
        void send(serverId, {
          action: "mock:network:restore",
          serverId,
          config,
          latencyPreset: config?.latencyPreset,
          chaosPreset: config?.chaosPreset,
        });
      }
      const declared = state.scenarios.some((scenario) => scenario.name === kept.scenario);
      if (kept.scenario !== null && kept.scenario !== state.activeScenario && declared) {
        void send(serverId, { action: "mock:scenario:apply", serverId, scenario: kept.scenario });
      }
    },
  };
}
