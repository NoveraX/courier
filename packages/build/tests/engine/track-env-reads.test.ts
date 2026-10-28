/**
 * @vitest-environment node
 *
 * The environment variables a config looks at, noted so a variable that
 * changes later reads the routes again: a name read, tested for or described
 * is noted, and code that lists every variable is taken to depend on all.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { trackEnvReads } from "../../src/engine/track-env-reads";

let original: NodeJS.ProcessEnv;

beforeEach(() => {
  original = process.env;
});

afterEach(() => {
  process.env = original;
});

describe("trackEnvReads", () => {
  it("notes each variable read, tested for or described, sorted", () => {
    const reads = trackEnvReads();

    void process.env.SHOP_PUBLIC;
    void ("API_URL" in process.env);
    void Object.getOwnPropertyDescriptor(process.env, "BASE_PATH");

    expect(reads.names()).toEqual(["API_URL", "BASE_PATH", "SHOP_PUBLIC"]);
  });

  it("takes code that lists every variable to depend on all of them", () => {
    const reads = trackEnvReads();

    void Object.keys(process.env);

    expect(reads.names()).toBe("*");
  });

  it("answers reads and writes as the environment itself does", () => {
    trackEnvReads();

    process.env.COURIER_TRACK_PROBE = "seen";

    expect(process.env.COURIER_TRACK_PROBE).toBe("seen");
    expect(original.COURIER_TRACK_PROBE).toBe("seen");
    delete process.env.COURIER_TRACK_PROBE;
  });
});
