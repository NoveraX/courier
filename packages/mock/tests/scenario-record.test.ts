/**
 * A mock server names its scenarios by their keys, to Studio and to the
 * admin API. Scenarios given as an array — as a JavaScript caller without
 * types can write — would be named "0", "1"…, so they are refused with
 * the shape to write instead.
 */
import { describe, expect, it } from "vitest";
import { defineScenario } from "../src/scenario/define-scenario";
import { ScenarioConfigError } from "../src/scenario/scenario-record";
import { createMockServer } from "../src/server/create-mock-server";

const empty = defineScenario("empty", () => {});
const failing = defineScenario("failing", () => {});

describe("a mock server's scenarios", () => {
  it("are kept by the names they are keyed by", () => {
    const server = createMockServer({ admin: false, log: false, scenarios: { empty, failing } });

    expect(Object.keys(server.scenarios)).toEqual(["empty", "failing"]);
  });

  it("are refused as an array, with the object to write instead", () => {
    const start = () =>
      createMockServer({
        admin: false,
        log: false,
        // @ts-expect-error a caller without types can pass an array
        scenarios: [empty, failing],
      });

    expect(start).toThrow(ScenarioConfigError);
    expect(start).toThrow(
      '{ "empty": defineScenario("empty", …), "failing": defineScenario("failing", …) }',
    );
  });
});
