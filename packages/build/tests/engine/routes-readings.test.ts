/**
 * @vitest-environment node
 *
 * The readings of a project's routes, when something goes wrong between
 * one reading and the next: every caller still waiting is told, and the
 * next caller reads again rather than waiting for ever.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as FingerprintModule from "../../src/engine/fingerprint";
import { fingerprintOf } from "../../src/engine/fingerprint";
import { createReadings } from "../../src/engine/routes-readings";
import type { RoutesSnapshot } from "../../src/engine/routes-snapshot";

vi.mock("../../src/engine/fingerprint", async (importOriginal) => {
  const actual = await importOriginal<typeof FingerprintModule>();
  return { ...actual, fingerprintOf: vi.fn(actual.fingerprintOf) };
});

afterEach(() => {
  vi.mocked(fingerprintOf).mockRestore();
});

const snapshot: RoutesSnapshot = {
  configFile: "/app/courier.config.ts",
  routes: {},
  files: [],
  env: [],
};

describe("createReadings", () => {
  it("tells every waiting caller what went wrong between readings, and reads again for the next", async () => {
    vi.mocked(fingerprintOf).mockImplementationOnce(() => {
      throw new Error("the system refused a look at a file");
    });
    const readings = createReadings(() => Promise.resolve(snapshot));

    const [first, second] = await Promise.all([readings.next(), readings.next()]);
    const third = await readings.next();

    expect(first).toEqual({ ok: false, error: new Error("the system refused a look at a file") });
    expect(second).toEqual(first);
    expect(third).toEqual({ ok: true, snapshot });
  });
});
