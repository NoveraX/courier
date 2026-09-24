/**
 * How the build plugins learn Studio's address from courier.config.
 *
 * Every failure was logged at debug as "No courier.config found": a config
 * that existed and would not load sent the browser to the default address
 * with nothing on screen to say why.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadStudioUrl } from "../src/plugins/core/load-studio-url";

let output: string[];
const roots: string[] = [];

beforeEach(() => {
  output = [];
  for (const stream of [process.stdout, process.stderr]) {
    vi.spyOn(stream, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
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
    const root = project(
      'import { defineApi } from "@noverax/courier/define";\n' +
        'export default { sources: { api: defineApi({ baseURL: "https://api.example", endpoints: {} }) }, studio: { host: "0.0.0.0", port: 7123 } };\n',
    );

    await expect(loadStudioUrl(root)).resolves.toBe("http://localhost:7123");
  });

  it("falls back quietly when the project has no config", async () => {
    await expect(loadStudioUrl(project())).resolves.toBe("http://localhost:6280");

    expect(output.join("")).not.toContain("WARN");
  });

  it("warns when the config exists and will not load", async () => {
    const root = project("export default {");

    await expect(loadStudioUrl(root)).resolves.toBe("http://localhost:6280");

    expect(output.join("")).toMatch(/WARN[\s\S]*courier\.config could not be loaded/);
  });
});
