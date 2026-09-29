/**
 * The Studio UI builds the same wherever the build is started. Its paths
 * resolved from the working directory, so a build run from the repository
 * root read no routes, failed, and left a `src/` directory behind there.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import config from "../vite.config";

describe("the Studio UI build", () => {
  it("takes its root from its own directory", () => {
    expect(config).toMatchObject({ root: join(import.meta.dirname, "..") });
  });
});
