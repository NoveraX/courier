import type { ServedTool } from "@noverax/courier-mcp/internal";

import type { CommandReply } from "../mock-manager/command-replies";
import type { ServerState } from "../mock-manager/types";
import { type SanitizedMockCommand, sanitizeMockCommand } from "../sanitize-mock-events";

/** The mocks as Studio's tools read and change them. */
export interface StudioMocks {
  /** Every mock Studio tracks, as it stands. */
  describeServers(): readonly ServerState[];
  /** Run a command on the mock it names; `undefined` when Studio has no mock by that name. */
  forwardStoreCommand(command: SanitizedMockCommand): Promise<CommandReply> | undefined;
}

/**
 * The tool that lists Studio's mocks: each one's name, the source it
 * serves, whether it runs and where, its scenarios and the one in force,
 * and the network conditions set on it.
 *
 * @param mocks - The mocks
 * @returns The tool
 * @example
 * ```ts
 * mocksTool(mockManager).run({}, caller);
 * ```
 */
export function mocksTool(mocks: StudioMocks): ServedTool {
  return {
    name: "mocks",
    title: "Mock servers",
    description:
      "The mock servers Studio runs: each one's id, the source it serves, its status and address, its scenarios and the active one, and the network conditions set on it.",
    access: "read",
    idempotent: true,
    action: "read mocks",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: { mocks: { type: "array", items: { type: "object" } } },
      required: ["mocks"],
    },
    run: async () => ({
      ok: true,
      data: {
        mocks: mocks.describeServers().map((state) => ({
          id: state.serverId,
          name: state.name,
          source: state.source,
          status: state.status,
          url: state.url,
          activeScenario: state.activeScenario,
          scenarios: state.scenarios.map(({ name, description }) => ({
            name,
            ...(description && { description }),
          })),
          latency: state.latencyPreset,
          chaos: state.chaosPreset,
        })),
      },
    }),
  };
}

/**
 * The tool that switches a mock to one of its scenarios, as Studio's Mocks
 * view does: the mock's answers follow the scenario from the next request.
 *
 * @param mocks - The mocks
 * @returns The tool
 * @example
 * ```ts
 * mockScenarioTool(mockManager).run({ mock: "shop", scenario: "empty" }, caller);
 * ```
 */
export function mockScenarioTool(mocks: StudioMocks): ServedTool {
  return {
    name: "mock_scenario",
    title: "Switch a mock's scenario",
    description:
      "Switch a mock server to one of its scenarios, by the ids and names mocks lists. Its answers follow the scenario from the next request.",
    access: "write",
    idempotent: true,
    action: "switch a mock's scenario",
    inputSchema: {
      type: "object",
      properties: { mock: { type: "string" }, scenario: { type: "string" } },
      required: ["mock", "scenario"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { mock: { type: "string" }, activeScenario: { type: "string" } },
    },
    run: async (args) => {
      const command = sanitizeMockCommand({
        action: "mock:scenario:apply",
        serverId: args.mock,
        scenario: args.scenario,
      });
      const reply = command && mocks.forwardStoreCommand(command);
      if (reply === undefined)
        return {
          ok: false,
          message: `Studio runs no mock ${String(args.mock)}: list them with mocks`,
        };
      const answered = await reply;
      return answered.ok
        ? { ok: true, data: { mock: args.mock, activeScenario: args.scenario } }
        : { ok: false, message: answered.error ?? "The mock did not switch" };
    },
  };
}
