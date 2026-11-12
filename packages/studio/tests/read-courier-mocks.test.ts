/**
 * What Studio keeps of a mocks file whose export could not be read: the
 * reason, which the terminal prints whole, with no secret of the project's
 * in it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EvaluatedCourierFiles } from "../src/server/evaluate-courier-files";
import type { LocatedCourierMocks } from "../src/server/locate-courier-mocks";
import { readCourierMocks } from "../src/server/read-courier-mocks";
import { stubOwnEnvironment } from "./helpers/own-environment";

const FILE = "/app/courier.mocks.ts";
const LOCATED: LocatedCourierMocks = { path: FILE, file: FILE, hashBefore: null, unreadable: null };

afterEach(() => {
  vi.unstubAllEnvs();
});

function evaluated(mocksNamespace: unknown): EvaluatedCourierFiles {
  return { config: { sources: {} }, mocksNamespace, mocksError: null } as EvaluatedCourierFiles;
}

describe("readCourierMocks", () => {
  it("keeps what a getter of the export threw with no value of the environment, nor a credential", () => {
    const thrown = "no seed for shop-signing-7f3a9c2e5b1d with token=abc123def";
    stubOwnEnvironment({ SHOP_SIGNING_KEY: "shop-signing-7f3a9c2e5b1d" }, thrown);
    const namespace = Object.defineProperty({}, "default", {
      get() {
        throw new RangeError(thrown);
      },
    });

    const { entries, error } = readCourierMocks(LOCATED, evaluated(namespace));

    expect(entries).toEqual({});
    expect(error).toMatchObject({
      name: "RangeError",
      message: "no seed for [redacted] with token=[redacted]",
    });
    expect((error as Error).stack).not.toMatch(/shop-signing-7f3a9c2e5b1d|abc123def/);
  });

  it("says an export of the wrong shape in its own words", () => {
    const { error } = readCourierMocks(LOCATED, evaluated({ default: [] }));

    expect(error).toMatchObject({
      message: `${FILE} must export an object of mocks by key: export default defineMocks({ ... })`,
    });
  });
});
