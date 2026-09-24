import { createLogger } from "@noverax/courier";
import type { DefinedApi } from "@noverax/courier/define";
import type { MockScenario, TypedMockFn } from "../types";
import { isThenable } from "./is-thenable";

const log = createLogger("MockScenario");

/**
 * Define a named scenario that configures multiple mocks at once.
 *
 * `setup` runs synchronously each time the scenario is applied, and must set
 * up every mock before it returns. An `async` setup is refused when applied:
 * whatever it set up after its first `await` would land after the scenario
 * was reported active, and a failure there would have nowhere to go.
 *
 * @param name - The scenario's name, as Studio and `applyScenario` refer to it
 * @param setup - Sets up the scenario's mocks
 * @returns The scenario
 *
 * @example
 * ```ts
 * const outage = defineScenario<typeof api>("outage", (mock) => {
 *   mock("users", "getAll").rejects(503, { message: "Down for maintenance" });
 * });
 * ```
 */
export function defineScenario<TApi extends DefinedApi<any>>(
  name: string,
  setup: (mock: TypedMockFn<TApi>) => void,
): MockScenario<TApi> {
  return {
    name,
    apply(mock) {
      const returned: unknown = setup(mock);
      if (!isThenable(returned)) return;
      returned.then(undefined, (reason: unknown) =>
        log.warn(`Scenario "${name}" failed after it was applied`, reason),
      );
      throw new Error(
        `Scenario "${name}" has an async setup; set up its mocks synchronously, without await.`,
      );
    },
  };
}
