import { createLogger } from "@noverax/courier";
import type * as ManagedMocks from "@noverax/courier-mock/managed";
import type { MockServerDescription } from "@noverax/courier-mock/managed";

/** A declared mock described, or the reason it could not be. */
export type DescribedEntry = { description: MockServerDescription } | { problem: string };

const log = createLogger("Mock");

let managed: Promise<typeof ManagedMocks> | undefined;

/**
 * Describe the mock declared under `mocks[key]` from the definition Studio
 * already loaded with the config, with no process of its own. Whatever keeps
 * it from being described is returned as a problem to report on the mock.
 *
 * @param key - The key under `mocks`.
 * @param definition - The value the config declared there.
 * @returns The description, or the problem to report.
 */
export async function describeEntry(key: string, definition: unknown): Promise<DescribedEntry> {
  managed ??= import("@noverax/courier-mock/managed");
  let mock: typeof ManagedMocks;
  try {
    mock = await managed;
  } catch (err) {
    managed = undefined;
    return {
      problem: `mocks.${key} needs @noverax/courier-mock, which could not be loaded: ${reason(err)}`,
    };
  }
  if (!mock.isMockServerDefinition(definition)) {
    return { problem: `mocks.${key} in courier.config is not a defineMockServer() definition.` };
  }
  let description: MockServerDescription;
  try {
    description = mock.describeMockServer(definition);
  } catch (err) {
    return { problem: `mocks.${key} could not be described: ${reason(err)}` };
  }
  for (const scenario of description.scenarios) {
    if (scenario.introspectionError === undefined) continue;
    log.warn(
      `mocks.${key}: scenario "${scenario.name}" was read only in part: ${scenario.introspectionError}`,
    );
  }
  return { description };
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
