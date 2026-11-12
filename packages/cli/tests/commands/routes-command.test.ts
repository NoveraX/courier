/**
 * `courier-cli routes`: the project's routes module, read from
 * courier.config.ts as Studio reads it, written where the config says or
 * `--out` does — and `--check`, which writes nothing and fails a CI step
 * when the module is out of date.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCommand } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routesCommand } from "../../src/commands/routes-command";
import { stubOwnEnvironment } from "../helpers/own-environment";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");
let dir: string;

function writeConfig({
  marked = ["list"],
  studio = "",
}: {
  marked?: string[];
  studio?: string;
} = {}): void {
  const endpoints = ["list", "create"]
    .map(
      (name) =>
        `${name}: endpoint.${name === "list" ? "get" : "post"}("")${marked.includes(name) ? ".expose()" : ".expose(false)"},`,
    )
    .join("\n");
  writeFileSync(
    join(dir, "courier.config.ts"),
    `
      import { courier, defineApi, defineGroup } from "@noverax/courier/define";
      const { endpoint } = courier();
      export default {
        sources: {
          shop: defineApi({
            baseURL: "https://api.example.com",
            groups: { orders: defineGroup({ prefix: "orders", endpoints: { ${endpoints} } }) },
          }),
        },
        ${studio}
      };
    `,
    "utf-8",
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-routes-command-"));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  writeConfig();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
  delete process.env.COURIER_PHASE;
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

async function run(...rawArgs: string[]): Promise<void> {
  await runCommand(routesCommand, { rawArgs: ["--cwd", dir, ...rawArgs] });
}

function said(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.flat().map(String).join("\n");
}

describe("courier-cli routes", () => {
  it("writes the module beside the config, and says what a page may call", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await run();

    const text = readFileSync(join(dir, "courier.routes.ts"), "utf-8");
    expect(text).toContain('"orders.list": { type: "query" },');
    expect(text).not.toContain("orders.create");
    expect(text).toContain("export const shopRoutes");
    expect(said(info)).toContain("Wrote courier.routes.ts: 1 endpoint a page may call, of shop");
    expect(process.exitCode).toBe(0);
  });

  it("checks the module without writing it, and fails once a mark changes", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await run();
    await run("--check");
    expect(process.exitCode).toBe(0);
    const before = readFileSync(join(dir, "courier.routes.ts"), "utf-8");

    writeConfig({ marked: ["list", "create"] });
    await run("--check");

    expect(process.exitCode).toBe(1);
    expect(said(warn)).toContain(
      "courier.routes.ts is out of date; `courier-cli routes` writes it again",
    );
    expect(readFileSync(join(dir, "courier.routes.ts"), "utf-8")).toBe(before);
  });

  it("writes where the config says, or --out does", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    writeConfig({ studio: 'studio: { routes: "src/lib/courier.routes.ts" },' });

    await run();
    await run("--out", join(dir, "web", "routes.ts"));

    expect(readFileSync(join(dir, "src/lib/courier.routes.ts"), "utf-8")).toContain(
      'import type config from "../../courier.config";',
    );
    expect(readFileSync(join(dir, "web/routes.ts"), "utf-8")).toContain(
      'import type config from "../courier.config";',
    );
  });

  it("says why a config did not load, in a line, and what to do, in another", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    writeFileSync(
      join(dir, "courier.config.ts"),
      `import "./missing";\nexport default { sources: {} };\n`,
    );

    await run("--check");

    expect(process.exitCode).toBe(1);
    expect(said(error)).toContain('courier.config.ts imports "./missing", which does not resolve.');
    expect(said(info)).toContain("Correct the import, or create the module it names.");
  });

  it("names the env files it reads when the config's code threw, and no variable's value", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    stubOwnEnvironment(
      { SHOP_TOKEN: "tok_live_4f9c2e7a" },
      "Invalid environment variables: tok_live_4f9c2e7a",
    );
    writeFileSync(
      join(dir, "courier.config.ts"),
      `throw new Error("Invalid environment variables: " + process.env.SHOP_TOKEN);\n`,
    );

    await run("--check");

    expect(said(error)).toContain(
      "courier.config.ts threw Error: Invalid environment variables: [redacted].",
    );
    expect(said(error) + said(info)).not.toContain("tok_live");
    expect(said(info)).toContain(
      "courier-cli reads the project's variables from .env.development.local",
    );
    vi.unstubAllEnvs();
  });

  it("says what reading the sources threw with no variable's value in it, nor a credential", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    stubOwnEnvironment(
      { SHOP_TOKEN: "tok_live_4f9c2e7a" },
      "the shop refused tok_live_4f9c2e7a with token=abc123def",
    );
    writeFileSync(
      join(dir, "courier.config.ts"),
      `export default {
        get sources() {
          throw new Error("the shop refused " + process.env.SHOP_TOKEN + " with token=abc123def");
        },
      };\n`,
    );

    await run("--check");

    expect(process.exitCode).toBe(1);
    expect(said(error)).toContain("the shop refused [redacted] with token=[redacted]");
    expect(said(error)).not.toMatch(/tok_live|abc123def/);
  });

  it("reads a Next.js project whose API module imports server-only, as Next's server does", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "16.4.3" } }));
    writeFileSync(
      join(dir, "shop.ts"),
      `import "server-only";
import { courier, defineApi } from "@noverax/courier/define";
const { endpoint } = courier();
export const shop = defineApi({ baseURL: "https://api.example.com", endpoints: { list: endpoint.get("").expose() } });
`,
    );
    writeFileSync(
      join(dir, "courier.config.ts"),
      `import { shop } from "./shop";\nexport default { sources: { shop } };\n`,
    );

    await run();

    expect(process.exitCode).toBe(0);
    expect(readFileSync(join(dir, "courier.routes.ts"), "utf8")).toContain(
      '"list": { type: "query" }',
    );
  });

  it("tells the project's code it reads definitions, so a check of the environment can be skipped", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    writeFileSync(
      join(dir, "courier.config.ts"),
      `if (process.env.COURIER_PHASE !== "definitions") throw new Error("Invalid environment variables");\nexport default { sources: {}, studio: { routes: false } };\n`,
    );

    await run("--check");

    expect(process.exitCode).toBe(0);
  });

  it("refuses a module --out would put outside the project", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await run("--out", join(dir, "..", "routes.ts"));

    expect(process.exitCode).toBe(1);
    expect(said(error)).toMatch(
      /--out is ".*routes\.ts", not a path in the project: it leaves the project/,
    );
  });

  it("writes nothing for a config that wants no module, and checks it as such", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    writeConfig({ studio: "studio: { routes: false }," });

    await run();
    expect(process.exitCode).toBe(1);
    expect(said(error)).toContain("courier.config.ts sets studio.routes to false");

    await run("--check");
    expect(process.exitCode).toBe(0);
    expect(existsSync(join(dir, "courier.routes.ts"))).toBe(false);
  });
});
