/**
 * The Studio UI builds the same wherever the build is started: its paths
 * resolve from its own directory, not the working directory, from which a
 * build run at the repository root would read no routes, fail, and leave a
 * `src/` directory behind there.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import config from "../vite.config";

describe("the Studio UI build", () => {
  it("takes its root from its own directory", () => {
    expect(config).toMatchObject({ root: join(import.meta.dirname, "..") });
  });
});
