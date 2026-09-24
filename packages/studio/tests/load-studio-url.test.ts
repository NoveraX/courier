/**
 * How the build plugins learn Studio's address from courier.config.
 *
 * Every failure was logged at debug as "No courier.config found": a config
 * that existed and would not load sent the browser to the default address
 * with nothing on screen to say why.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadStudioUrl } from "../src/plugins/core/load-studio-url";
import { studioTransformCache } from "../src/server/studio-transform-cache";

const CONFIG_ON_7123 =
  'import { defineApi } from "@noverax/courier/define";\n' +
  'export default { sources: { api: defineApi({ baseURL: "https://api.example", endpoints: {} }) }, studio: { host: "0.0.0.0", port: 7123 } };\n';

let output: string[];
const roots: string[] = [];

beforeEach(() => {
  output = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A project under the repository's node_modules, so its config resolves the workspace packages. */
function project(config?: string): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "studio-url-"));
  roots.push(root);
  if (config !== undefined) writeFileSync(join(root, "courier.config.ts"), config);
  return root;
}

describe("loadStudioUrl", () => {
  it("reads the configured address, formatted for dialling", async () => {
    const root = project(CONFIG_ON_7123);

    await expect(loadStudioUrl(root)).resolves.toBe("http://localhost:7123");
  });

  it("falls back quietly when the project has no config", async () => {
    await expect(loadStudioUrl(project())).resolves.toBe("http://localhost:6280");

    expect(output.join("")).not.toContain("WARN");
  });

  it("reads the address from a config that declares no sources", async () => {
    const root = project("export default { studio: { port: 7124 } };\n");

    await expect(loadStudioUrl(root)).resolves.toBe("http://localhost:7124");

    expect(output.join("")).not.toContain("WARN");
  });

  it("reads the address without evaluating courier.mocks.ts", async () => {
    const root = project(CONFIG_ON_7123);
    const marker = join(root, "mocks-evaluated");
    writeFileSync(
      join(root, "courier.mocks.ts"),
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "yes");\nexport default {};\n`,
    );

    await expect(loadStudioUrl(root)).resolves.toBe("http://localhost:7123");

    expect(readdirSync(root)).not.toContain("mocks-evaluated");
  });

  it("warns when the config exists and will not load", async () => {
    const root = project("export default {");

    await expect(loadStudioUrl(root)).resolves.toBe("http://localhost:6280");

    expect(output.join("")).toMatch(/WARN[\s\S]*courier\.config could not be loaded/);
  });
});

describe("loadStudioUrl's transforms of the project", () => {
  it("keeps them in the project's node_modules, where the next read and Studio find them", async () => {
    vi.stubEnv("COURIER_TRANSFORM_CACHE", "on");
    const root = project(CONFIG_ON_7123);
    mkdirSync(join(root, "node_modules"));

    const url = await loadStudioUrl(root);

    expect(url).toBe("http://localhost:7123");
    expect(
      readdirSync(join(root, "node_modules", ".cache", "courier", "transform")).length,
    ).toBeGreaterThan(0);
  });

  it("keeps none of them in the transform cache Studio holds for the process", async () => {
    const root = project(CONFIG_ON_7123);
    const studioTransform = vi.spyOn(studioTransformCache(root), "transform");

    const url = await loadStudioUrl(root);

    expect(url).toBe("http://localhost:7123");
    expect(studioTransform).not.toHaveBeenCalled();
  });
});

describe("loadStudioUrl in a bundler", () => {
  it("loads no parser, when the plugin is imported or when it reads the address", async () => {
    vi.resetModules();
    vi.doMock("oxc-parser", () => {
      throw new Error("oxc-parser was loaded");
    });
    const root = project(CONFIG_ON_7123);

    const { loadStudioUrl: fresh } = await import("../src/plugins/core/load-studio-url");
    await import("../src/plugins/vite");
    const url = await fresh(root);

    expect(url).toBe("http://localhost:7123");
    expect(output.join("")).not.toContain("oxc-parser was loaded");
    vi.doUnmock("oxc-parser");
  });
});
