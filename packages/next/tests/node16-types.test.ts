/**
 * The route factories' types under `node16` module resolution.
 *
 * Next.js has no `exports` map, so an ES module resolved the Node way must
 * name `next/server.js`; the bare `next/server` does not resolve there. A
 * consumer on `node16` or `nodenext` got TS2307 from the published
 * declarations, and with `skipLibCheck` every `NextRequest` silently became
 * `any`.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const TSC = fileURLToPath(new URL("../../../node_modules/typescript/bin/tsc", import.meta.url));

describe("the route factories under node16 resolution", () => {
  it("type-check, resolving NextRequest", () => {
    const result = spawnSync(
      process.execPath,
      [
        TSC,
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--module",
        "node16",
        "--moduleResolution",
        "node16",
        "--target",
        "esnext",
        "--types",
        "node",
        "--ignoreConfig",
        "src/api-route.ts",
        "src/sse-route.ts",
      ],
      { cwd: PACKAGE, encoding: "utf8" },
    );

    expect(result.stdout).toBe("");
    expect(result.status).toBe(0);
  }, 60_000);
});
