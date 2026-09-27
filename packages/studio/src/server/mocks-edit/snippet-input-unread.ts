import type { PlanInput } from "./plan/types";
import type { MockDeclaration } from "./types";

/**
 * What a snippet is built from for a caller Studio must not show the
 * project to: the lines to add to a mocks file, read from nothing.
 *
 * @param requests - The mocks asked for
 * @returns The snippet's input
 */
export function snippetInputUnread(requests: readonly MockDeclaration[]): PlanInput {
  const name = "courier.mocks.ts";
  return {
    existing: { name, text: null },
    createName: name,
    configName: "courier.config.ts",
    configText: null,
    explicitExtensions: false,
    requests,
  };
}
