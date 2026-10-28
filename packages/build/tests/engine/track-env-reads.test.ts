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

  it("notes nothing that runs untracked, nor anything before it resumes when made paused", () => {
    const reads = trackEnvReads({ paused: true });
    void process.env.LOADER_STARTING;
    void Object.keys(process.env);

    reads.resume();
    void process.env.SHOP_PUBLIC;
    const loaded = reads.untracked(() => {
      void Object.keys(process.env);
      return process.env.LOADER_TRANSFORMING ?? "loaded";
    });

    expect(loaded).toBe("loaded");
    expect(reads.names()).toEqual(["SHOP_PUBLIC"]);
  });

  it("lets code assign a variable already set, alone or many at once, as the environment itself does", () => {
    process.env.COURIER_TRACK_SET = "before";
    trackEnvReads();

    process.env.COURIER_TRACK_SET = "after";
    Object.assign(process.env, { COURIER_TRACK_SET: "assigned", COURIER_TRACK_NEW: 1 });

    expect(original.COURIER_TRACK_SET).toBe("assigned");
    expect(original.COURIER_TRACK_NEW).toBe("1");
    delete process.env.COURIER_TRACK_SET;
    delete process.env.COURIER_TRACK_NEW;
    expect("COURIER_TRACK_SET" in original).toBe(false);
  });

  it("answers reads and writes as the environment itself does", () => {
    trackEnvReads();

    process.env.COURIER_TRACK_PROBE = "seen";

    expect(process.env.COURIER_TRACK_PROBE).toBe("seen");
    expect(original.COURIER_TRACK_PROBE).toBe("seen");
    delete process.env.COURIER_TRACK_PROBE;
  });
});
