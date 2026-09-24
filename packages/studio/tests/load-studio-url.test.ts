/**
 * How the build plugins learn Studio's address from courier.config.
 *
 * The configured host went to the browser verbatim: `0.0.0.0`, which cannot
 * be dialled, or an unbracketed IPv6 address, which is not a URL.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadStudioUrl } from "../src/plugins/core/load-studio-url";

const roots: string[] = [];

afterEach(() => {
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
});
