/**
 * @vitest-environment node
 *
 * The routes of a project whose API modules import what its framework's
 * server answers itself, read in a process of their own as a bundler's
 * plugin reads them during `next build` or `vite build`. Requires a build of
 * this package first, whose worker the process runs.
 */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateInChild } from "../../src/engine/evaluate-in-child";
import { RoutesReadError } from "../../src/engine/routes-read-error";

/* The repository's packages, where a config's `@noverax/courier` resolves from. */
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-profiles-in-child-")));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

/** A project built with the framework `dependencies` name, whose API module starts with `head`. */
function project(dependencies: Record<string, string>, head: string, expose = "true"): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", dependencies }));
  writeFileSync(
    join(dir, "api.ts"),
    `${head}
import { courier, defineApi } from "@noverax/courier/define";

const { endpoint } = courier();

export const shop = defineApi({
  baseURL: "https://shop.example.com",
  endpoints: { search: endpoint.get("search").expose(${expose}) },
});
`,
  );
  writeFileSync(
    join(dir, "courier.config.ts"),
    `import { shop } from "./api";\n\nexport default { sources: { shop } };\n`,
  );
}

describe("the routes of a Next.js project", () => {
  it("are read from an API module that imports server-only", async () => {
    project({ next: "16.4.3" }, `import "server-only";`);

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(snapshot.routes.shop?.endpoints).toEqual({ search: { type: "query" } });
  }, 30_000);

  it("are not read when an API module imports client-only, saying why", async () => {
    project({ next: "16.4.3" }, `import "client-only";`);

    const error = await evaluateInChild({ root: dir, envFiles: [] }).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(RoutesReadError);
    expect((error as RoutesReadError).code).toBe("CONFIG_NOT_LOADED");
    expect((error as RoutesReadError).message).toBe(
      'courier.config.ts did not load, so the routes a page takes were not read: api.ts imports "client-only": it is the marker of code for the browser, which Next.js refuses on the server, where courier.config is read (courier.config.ts → api.ts). Import that code from a client component alone, out of the modules courier.config imports.',
    );
  }, 30_000);
});

describe("the routes of a SvelteKit project", () => {
  it("are read from $env/static/private, depending on the one variable read", async () => {
    vi.stubEnv("SHOP_SEARCH_PUBLIC", "1");
    project(
      { "@sveltejs/kit": "2.48.0" },
      `import { SHOP_SEARCH_PUBLIC } from "$env/static/private";`,
      `SHOP_SEARCH_PUBLIC === "1"`,
    );

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(snapshot.routes.shop?.endpoints).toEqual({ search: { type: "query" } });
    expect(snapshot.env).toContain("SHOP_SEARCH_PUBLIC");
    expect(snapshot.env).not.toBe("*");
  }, 30_000);
});
