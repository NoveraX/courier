import type { StudioToken } from "../../src/server/studio-token";

/** The value of `FIXED_TOKEN`, for a socket that presents it. */
export const FIXED_TOKEN_VALUE = "t".repeat(43);

/** A Studio token for tests that need one without a project on disk. */
export const FIXED_TOKEN: StudioToken = {
  value: FIXED_TOKEN_VALUE,
  matches: (candidate) => candidate === FIXED_TOKEN_VALUE,
};
