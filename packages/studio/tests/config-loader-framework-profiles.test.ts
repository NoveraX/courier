/**
 * Studio loads a project whose API modules import what its framework's
 * server answers itself, as the framework's server would: the config and
 * the mocks file beside it, over the one module graph Studio evaluates.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigLoaderError, loadCourierConfig } from "../src/server/config-loader";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-config-loader-profiles-"));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function write(relPath: string, body: string): void {
  const full = join(dir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body, "utf8");
}

const API = (head: string, baseURL: string) => `${head}
import { defineApi } from "@noverax/courier/define";
export const shop = defineApi({ baseURL: ${baseURL}, endpoints: {} });
`;

describe("Studio's loader", () => {
  it("loads a Next.js project whose API module imports server-only, and its mocks file", async () => {
    write("package.json", JSON.stringify({ type: "module", dependencies: { next: "16.4.3" } }));
    write("src/api.ts", API(`import "server-only";`, `"https://shop.example.com"`));
    write(
      "courier.config.ts",
      `import { shop } from "./src/api";\nexport default { sources: { shop } };\n`,
    );
    write(
      "courier.mocks.ts",
      `import "server-only";\nimport { shop } from "./src/api";\nexport default { shop: { port: 7001, of: shop } };\n`,
    );

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.config.sources)).toEqual(["shop"]);
    expect(loaded.mocks.error).toBeNull();
  });

  it("loads a SvelteKit project whose API module reads $env/static/private", async () => {
    vi.stubEnv("SHOP_URL", "https://shop.example.com");
    write(
      "package.json",
      JSON.stringify({ type: "module", dependencies: { "@sveltejs/kit": "2.48.0" } }),
    );
    write("src/api.ts", API(`import { SHOP_URL } from "$env/static/private";`, "SHOP_URL"));
    write(
      "courier.config.ts",
      `import { shop } from "./src/api";\nexport default { sources: { shop } };\n`,
    );

    const loaded = await loadCourierConfig(dir);

    expect(loaded.config.sources.shop?.options?.baseURL).toBe("https://shop.example.com");
  });
});

describe("Studio's loader, given a project that does not load", () => {
  it("says what failed, the chain of imports to it, and what to do", async () => {
    write("package.json", JSON.stringify({ type: "module", dependencies: { next: "16.4.3" } }));
    write("src/api.ts", `import "client-only";\nexport const shop = {};\n`);
    write(
      "courier.config.ts",
      `import { shop } from "./src/api";\nexport default { sources: { shop } };\n`,
    );

    const error = await loadCourierConfig(dir).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ConfigLoaderError);
    expect((error as ConfigLoaderError).message).toBe(
      'Failed to load courier.config: src/api.ts imports "client-only": it is the marker of code for the browser, which Next.js refuses on the server, where courier.config is read (courier.config.ts → src/api.ts). Import that code from a client component alone, out of the modules courier.config imports.',
    );
  });
});
