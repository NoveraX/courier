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
  process.exitCode = undefined;
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
