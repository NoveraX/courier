/**
 * `courier-studio openapi`: the project's sources, read from
 * courier.config.ts as Studio reads them, written as OpenAPI documents — and
 * a document it writes is one Studio's own import reads back to the same
 * endpoints.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCommand } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../../src/apis/parser/parse-spec";
import { openapiCommand } from "../../src/commands/openapi-command";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-openapi-command-"));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  writeFileSync(
    join(dir, "courier.config.ts"),
    `
      import { courier, defineApi, defineGroup } from "@noverax/courier/define";
      import { z } from "zod";
      const { endpoint, channel } = courier();
      const User = z.object({ id: z.string(), name: z.string() });
      export default {
        sources: {
          shop: defineApi({
            baseURL: "https://api.example.com/v1",
            groups: {
              users: defineGroup({
                prefix: "users",
                endpoints: {
                  get: endpoint.get(":id").variables(z.object({ id: z.string() })).response(User),
                  create: endpoint.post("").variables(z.object({ name: z.string() })).response(User),
                  remove: endpoint.del(":id").variables(z.object({ id: z.string() })),
                },
              }),
            },
            endpoints: { room: channel.response(z.string()).via((ws) => ws.connect("room")) },
          }),
          billing: defineApi({ baseURL: "https://billing.example.com", endpoints: { health: endpoint.get("health") } }),
        },
      };
    `,
    "utf-8",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

async function run(...rawArgs: string[]): Promise<void> {
  await runCommand(openapiCommand, { rawArgs: ["--cwd", dir, ...rawArgs] });
}

describe("courier-studio openapi", () => {
  it("writes each source to a folder, and says which endpoints a document leaves out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});

    await run("--out", join(dir, "docs"));

    const shop = JSON.parse(readFileSync(join(dir, "docs", "shop.openapi.json"), "utf-8"));
    expect(Object.keys(shop.paths)).toEqual(["/users/{id}", "/users"]);
    expect(existsSync(join(dir, "docs", "billing.openapi.json"))).toBe(true);
    expect(warn.mock.calls.join(" ")).toContain(
      "shop.room is left out: a channel (WebSocket) has no form in OpenAPI",
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("writes a document Studio's import reads back to the same endpoints", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const out = join(dir, "shop.json");

    await run("--source", "shop", "--api-version", "2.4.0", "--out", out);
    const parsed = parseSpec(readFileSync(out, "utf-8"));

    expect(parsed.version).toBe("2.4.0");
    expect(parsed.baseURL).toBe("https://api.example.com/v1");
    const endpoints = parsed.groups.flatMap((group) =>
      group.endpoints.map(
        (endpoint) => `${endpoint.httpMethod} ${endpoint.fullPath} ${endpoint.operationId}`,
      ),
    );
    expect(endpoints.sort()).toEqual([
      "delete /users/{id} users.remove",
      "get /users/{id} users.get",
      "post /users users.create",
    ]);
  });

  it("refuses an unknown source, and several sources with nowhere to put them, with one line each", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await run("--source", "nope");
    expect(error.mock.calls.join(" ")).toContain(
      'courier.config.ts has no source "nope" — it has shop, billing',
    );
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    await run();
    expect(error.mock.calls.join(" ")).toContain("Several sources go to a folder");
    expect(process.exitCode).toBe(1);
  });
});
