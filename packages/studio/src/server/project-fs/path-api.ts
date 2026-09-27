import type { posix } from "node:path";

/**
 * The part of `node:path` the containment checks use. Passing
 * `path.win32` or `path.posix` explicitly lets them be tested for the other
 * platform; the default is the platform's own.
 */
export type PathApi = Pick<
  typeof posix,
  "relative" | "isAbsolute" | "resolve" | "sep" | "parse" | "normalize"
>;
