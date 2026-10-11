/**
 * `courier-mcp` as an editor starts it: the official stdio client spawns the
 * built command in a project, which loads its courier.config.ts — one that
 * prints while it loads — with the environment file it was given, and calls
 * the project's API through it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type ShopUpstream, startShopUpstream } from "./support/shop";

const CLI = resolve(import.meta.dirname, "../lib/cli.js");
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");
const ENV = {
  PATH: process.env.PATH ?? "",
  NODE_ENV: "production",
  COURIER_TRANSFORM_CACHE: "0",
} as const;

let upstream: ShopUpstream;
let dir: string;

beforeAll(async () => {
  if (!existsSync(CLI))
    throw new Error("Build @noverax/courier-mcp first: its command runs from lib/cli.js");
  upstream = await startShopUpstream();
  dir = mkdtempSync(join(tmpdir(), "courier-mcp-cli-"));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, ".env.test"), `SHOP_URL=${upstream.baseURL}\n`);
  writeFileSync(
    join(dir, "courier.config.ts"),
    `
      import { courier, defineApi } from "@noverax/courier/define";
      import { z } from "zod";
      console.log("a config that prints while it loads");
      const { endpoint } = courier();
      export default {
        sources: {
          shop: defineApi({
            baseURL: process.env.SHOP_URL,
            endpoints: {
              order: endpoint
                .get("orders/:id")
                .variables(z.object({ id: z.string() }))
                .response(z.object({ id: z.string(), total: z.number() }).passthrough())
                .agent({ description: "One order by its id", access: "read" }),
              purge: endpoint.del("orders"),
            },
          }),
        },
      };
    `,
  );
});

afterAll(async () => {
  await upstream?.close();
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe("courier-mcp", () => {
  it("serves the project's tools to an editor's client, its stdout kept for the protocol", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI, "--cwd", dir, "--dotenv", ".env.test"],
      env: ENV,
      stderr: "pipe",
    });
    let log = "";
    transport.stderr?.on("data", (chunk: Buffer) => {
      log += chunk.toString();
    });
    const client = new Client({ name: "editor", version: "1.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const order = await client.callTool({ name: "order", arguments: { id: "7" } });
    await client.close();

    expect(tools.map((tool) => tool.name)).toEqual(["order"]);
    expect(order.structuredContent).toEqual({ id: "7", status: "open", total: 42 });
    expect(upstream.received).toEqual(["GET /orders/7"]);
    expect(log).toContain("a config that prints while it loads");
    expect(log).toContain("1 tool: order");
  });

  it("stops with one line naming a source the config does not have", () => {
    const run = spawnSync(
      process.execPath,
      [CLI, "--cwd", dir, "--dotenv", ".env.test", "--source", "nope"],
      {
        env: ENV,
        input: "",
        encoding: "utf8",
      },
    );

    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("--source nope: courier.config has no such source — it has shop");
  });

  it("prints its options on --help", () => {
    const run = spawnSync(process.execPath, [CLI, "--help"], { env: ENV, encoding: "utf8" });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("courier-mcp [options]");
    for (const option of ["--allow-destructive", "--read-only", "--deny", "--list"]) {
      expect(run.stdout).toContain(option);
    }
  });

  it("lists what is offered to agents and why on --list, without serving", () => {
    const calls = upstream.received.length;
    const run = spawnSync(
      process.execPath,
      [CLI, "--cwd", dir, "--dotenv", ".env.test", "--list"],
      {
        env: ENV,
        encoding: "utf8",
      },
    );

    expect(run.status).toBe(0);
    expect(run.stdout.split("\n")).toEqual([
      "1 of 2 endpoints offered to agents",
      'agents: offer "marked", access "destructive", confirm "destructive"',
      "",
      "  order  read  shop.order  marked .agent()",
      "",
      "Kept from agents",
      "  shop.purge  DELETE orders  not marked .agent()",
      "",
    ]);
    expect(run.stderr).toContain("a config that prints while it loads");
    expect(upstream.received).toHaveLength(calls);
  });

  it("narrows what is offered on --read-only and --deny, never widening it", () => {
    const run = spawnSync(
      process.execPath,
      [CLI, "--cwd", dir, "--dotenv", ".env.test", "--list", "--read-only", "--deny", "shop.ord*"],
      { env: ENV, encoding: "utf8" },
    );

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("0 of 2 endpoints offered to agents");
    expect(run.stdout).toContain('access "read"');
    expect(run.stdout).toContain("shop.order  GET orders/:id  denied by shop.ord*");
  });
});
