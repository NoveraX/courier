/**
 * @vitest-environment node
 *
 * One engine per project in a process: a build that runs Vite once per
 * environment reads the routes once for all of them.
 */
import { describe, expect, it } from "vitest";

import { sharedEngine } from "../../src/engine/shared-engine";

describe("sharedEngine", () => {
  it("hands the plugins made for one project the same engine", () => {
    const options = { root: "/app", envFiles: ["/app/.env"] };

    expect(sharedEngine(options)).toBe(sharedEngine({ ...options }));
  });

  it("keeps the engines of different projects, configs and env files apart", () => {
    const engine = sharedEngine({ root: "/app" });

    expect(sharedEngine({ root: "/web" })).not.toBe(engine);
    expect(sharedEngine({ root: "/app", config: "config/courier.config.ts" })).not.toBe(engine);
    expect(sharedEngine({ root: "/app", envFiles: ["/app/.env"] })).not.toBe(engine);
  });
});
