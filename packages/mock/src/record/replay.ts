import type { DefinedApi } from "@noverax/courier/define";

import type { MockScenario, TypedMockFn } from "../types";
import type { Fixture } from "./fixture";
import { harToFixtures } from "./fixture";
import type { HarLog } from "./har-format";

/**
 * Create a scenario from recorded fixtures.
 * Each fixture becomes a mock that returns the recorded response.
 *
 * @example
 * ```ts
 * const fixtures = loadFixtures("__fixtures__/api");
 * const { client } = createMockClient<typeof api>({
 *   scenario: replayFixtures(fixtures),
 * });
 * ```
 */
export function replayFixtures<TApi extends DefinedApi<any>>(
  fixtures: Fixture[],
  name = "replay",
): MockScenario<TApi> {
  return {
    name,
    apply(mock: TypedMockFn<TApi>) {
      // Group fixtures by endpoint — last recorded wins as default
      const grouped = groupByEndpoint(fixtures);

      for (const [key, endpointFixtures] of grouped) {
        const [group = "", method = ""] = key.split("/");
        const lastFixture = endpointFixtures[endpointFixtures.length - 1];
        if (!lastFixture) continue;

        if (endpointFixtures.length === 1) {
          // Single fixture → static response
          (mock as (g: string, m: string) => { resolves: (d: unknown) => void })(
            group,
            method,
          ).resolves(lastFixture.response.data);
        } else {
          // Multiple fixtures → sequence
          const responses = endpointFixtures.map((f) => f.response.data);
          (mock as (g: string, m: string) => { sequence: (r: unknown[]) => void })(
            group,
            method,
          ).sequence(responses);
        }
      }
    },
  };
}

/**
 * Create a replay scenario from a HAR log.
 *
 * @example
 * ```ts
 * const har = JSON.parse(fs.readFileSync("recording.har", "utf-8"));
 * const scenario = replayHar(har);
 * ```
 */
export function replayHar<TApi extends DefinedApi<any>>(
  har: HarLog,
  name = "har-replay",
): MockScenario<TApi> {
  const fixtures = harToFixtures(har);
  return replayFixtures(fixtures, name);
}

function groupByEndpoint(fixtures: Fixture[]): Map<string, Fixture[]> {
  const map = new Map<string, Fixture[]>();
  for (const fixture of fixtures) {
    const key = `${fixture.group}/${fixture.method}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(fixture);
  }
  return map;
}
