import { createLogger } from "@noverax/courier";
import type { AnySource } from "@noverax/courier/define";
import type { TypedMockFn } from "../typed-mock-fn";
import type { MockScenario } from "../types";
import { isThenable } from "./is-thenable";

const log = createLogger("MockScenario");

/**
 * Define a named scenario that configures multiple mocks at once.
 *
 * With a source as the type argument, `mock` takes that source's group and
 * endpoint names and responses, and the scenario is accepted by a mock of
 * that source — or of one that has every endpoint it names — and rejected by
 * any other. Without one, `mock` takes any name and the scenario fits every
 * mock. A scenario written inline inside `scenarios` is not typed that way;
 * give it the type argument.
 *
 * `setup` runs synchronously each time the scenario is applied, and must set
 * up every mock before it returns. An `async` setup is refused when applied:
 * whatever it set up after its first `await` would land after the scenario
 * was reported active, and a failure there would have nowhere to go.
 *
 * @typeParam TSource - The API the scenario is written for; leave it out for any
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
export function defineScenario<TSource extends AnySource = AnySource>(
  name: string,
  setup: (mock: TypedMockFn<TSource>) => void,
): MockScenario<TSource> {
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
