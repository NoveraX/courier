import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSourceName } from "@noverax/courier/define";
import { ConfigLoaderError, loadCourierConfig } from "../src/server/config-loader";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-relative-base-"));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
});

afterEach(() => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

function writeConfig(body: string): void {
  writeFileSync(join(dir, "courier.config.ts"), body, "utf-8");
}

describe("a source served from the app's own origin", () => {
  it("takes its name from the config key", async () => {
    /* No host to derive a name from, and no `name` written anywhere — the key
       is the only identifier there is. */
    writeConfig(`
      import { defineApi } from "@noverax/courier/define";
      export default {
        sources: { billing: defineApi({ baseURL: "/", endpoints: {} }) },
      };
    `);

    const { config } = await loadCourierConfig(dir);

    expect(getSourceName(config.sources.billing)).toBe("billing");
  });

  it("takes its name from the config key when baseURL is a relative path", async () => {
    writeConfig(`
      import { defineApi } from "@noverax/courier/define";
      export default {
        sources: { billing: defineApi({ baseURL: "/api/v2", endpoints: {} }) },
      };
    `);

    const { config } = await loadCourierConfig(dir);

    expect(getSourceName(config.sources.billing)).toBe("billing");
  });

  it("still refuses a name its author chose that the key contradicts", async () => {
    writeConfig(`
      import { defineApi } from "@noverax/courier/define";
      export default {
        sources: {
          billing: defineApi({ name: "invoices", baseURL: "/", endpoints: {} }),
        },
      };
    `);

    await expect(loadCourierConfig(dir)).rejects.toBeInstanceOf(ConfigLoaderError);
  });

  it("overrides a name derived from the host without complaining", async () => {
    writeConfig(`
      import { defineApi } from "@noverax/courier/define";
      export default {
        sources: {
          billing: defineApi({ baseURL: "https://stripe.com", endpoints: {} }),
        },
      };
    `);

    const { config } = await loadCourierConfig(dir);

    expect(getSourceName(config.sources.billing)).toBe("billing");
  });
});
