import type { AnySource } from "@noverax/courier/define";

import type { MockRequestContext, MockScenario } from "../types";
import { RecorderError } from "./errors";
import type { Fixture } from "./fixture";
import { harToFixtures } from "./fixture";
import type { HarLog } from "./har-format";
import { findFixture, replayAnswer } from "./match-fixture";

/**
 * Create a scenario from recorded fixtures.
 *
 * Each call answers with the recording made for its endpoint and its
 * variables: its data, or — for an error status — a rejection with the
 * `HTTPError` the real call rejected with. Several recordings of the same
 * call are answered in order, the last one from then on. A call nothing was
 * recorded for is refused with a `RecorderError`.
 *
 * @param fixtures Recordings, from `createRecorder` or `harToFixtures`
 * @param name     The scenario's name
 * @returns The scenario
 * @example
 * ```ts
 * const fixtures = loadFixtures("__fixtures__/api");
 * const { client } = createMockClient<typeof api>({
 *   scenario: replayFixtures(fixtures),
 * });
 * ```
 */
export function replayFixtures<TApi extends AnySource>(
  fixtures: Fixture[],
  name = "replay",
): MockScenario<TApi> {
  return {
    name,
    apply(mock) {
      for (const [key, recorded] of groupByEndpoint(fixtures)) {
        const [group = "", method = ""] = key.split("/");
        mock(group, method).returns(replayer(group, method, recorded));
      }
    },
  };
}

/**
 * Create a replay scenario from a HAR log.
 *
 * @param har  A HAR log written by `toHar` or `fixturesToHar`
 * @param name The scenario's name
 * @returns The scenario, as `replayFixtures` builds it
 * @example
 * ```ts
 * const har = JSON.parse(fs.readFileSync("recording.har", "utf-8"));
 * const scenario = replayHar(har);
 * ```
 */
export function replayHar<TApi extends AnySource>(
  har: HarLog,
  name = "har-replay",
): MockScenario<TApi> {
  const fixtures = harToFixtures(har);
  return replayFixtures(fixtures, name);
}

/** Answers each call from the recordings of its variables, in order, the last one repeating */
function replayer(
  group: string,
  method: string,
  recorded: Fixture[],
): (ctx: MockRequestContext) => unknown {
  /* A recording leaves the list once answered, unless it is the last of
     its call, which then answers every later one. */
  const remaining = [...recorded];
  return (ctx) => {
    const fixture = findFixture(remaining, group, method, ctx.variables);
    if (!fixture) throw new RecorderError("RECORDING_NOT_FOUND", group, method, ctx.variables);
    if (hasAnother(remaining, fixture, group, method, ctx.variables)) {
      remaining.splice(remaining.indexOf(fixture), 1);
    }
    return replayAnswer(fixture, false);
  };
}

/** Whether a later recording of the same call is waiting behind this one */
function hasAnother(
  remaining: Fixture[],
  current: Fixture,
  group: string,
  method: string,
  variables: unknown,
): boolean {
  const rest = remaining.slice(remaining.indexOf(current) + 1);
  return findFixture(rest, group, method, variables) !== undefined;
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
