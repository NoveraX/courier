/**
 * `courier-mcp` as an editor keeps it running: a save to the project's
 * config — or to a module it reaches — loads it again, and the client is
 * told the tools changed, on the 2025 handshake by the unsolicited
 * notification and under 2026-07-28 on the stream it opened with
 * subscriptions/listen. A save that changes nothing an agent sees tells
 * nothing; with --no-watch the server keeps the tools it started with.
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client as ModernClient } from "@modelcontextprotocol/client";
import { StdioClientTransport as ModernStdio } from "@modelcontextprotocol/client/stdio";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

const CLI = resolve(import.meta.dirname, "../lib/cli.js");
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");
const ENV = { PATH: process.env.PATH ?? "", NODE_ENV: "production", COURIER_TRANSFORM_CACHE: "0" };

const projects: string[] = [];
const closers: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close().catch(() => undefined);
  for (const dir of projects.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const API = `
import { courier, defineApi } from "@noverax/courier/define";
const { endpoint } = courier();
export const shop = defineApi({
  baseURL: "https://shop.example",
  endpoints: {
    order: endpoint.get("orders/:id").agent({ description: "One order by its id", access: "read" }),
    orders: endpoint.get("orders"),
  },
});
`;
const config = (agents = "") =>
  `import { shop } from "./api";\nexport default { sources: { shop }${agents} };\n`;

async function project(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "courier-mcp-reload-"));
  projects.push(dir);
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, "api.ts"), API);
  writeFileSync(join(dir, "courier.config.ts"), config());
  /* Late creation notifications of the fixture itself must not pass for a save. */
  await new Promise((done) => setTimeout(done, 300));
  return dir;
}

async function until(check: () => boolean, ms = 6000): Promise<void> {
  const started = Date.now();
  while (!check() && Date.now() - started < ms) await new Promise((done) => setTimeout(done, 25));
}

describe("a server that follows its project", () => {
  it("tells a client on the 2025 handshake that the tools changed once the config is saved", async () => {
    const dir = await project();
    const client = new LegacyClient({ name: "editor", version: "1.0.0" });
    let told = 0;
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      told += 1;
    });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [CLI, "--cwd", dir],
        env: ENV,
        stderr: "pipe",
      }),
    );
    closers.push(() => client.close());
    expect(client.getServerCapabilities()?.tools?.listChanged).toBe(true);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["order"]);

    writeFileSync(join(dir, "courier.config.ts"), config(`, agents: { offer: "reads" }`));
    await until(() => told > 0);

    expect(told).toBe(1);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["order", "orders"]);
  }, 30_000);

  it("tells a 2026-07-28 client on the stream it opened, and nothing for a save an agent cannot see", async () => {
    const dir = await project();
    const client = new ModernClient(
      { name: "editor", version: "2.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    let told = 0;
    client.setNotificationHandler("notifications/tools/list_changed", async () => {
      told += 1;
    });
    await client.connect(
      new ModernStdio({
        command: process.execPath,
        args: [CLI, "--cwd", dir],
        env: ENV,
        stderr: "pipe",
      }) as never,
    );
    closers.push(() => client.close());
    const subscription = await client.listen({ toolsListChanged: true });
    expect(subscription.honoredFilter).toEqual({ toolsListChanged: true });

    writeFileSync(join(dir, "api.ts"), `${API}\n// a comment no agent sees\n`);
    await new Promise((done) => setTimeout(done, 700));
    expect(told).toBe(0);

    writeFileSync(join(dir, "api.ts"), API.replace("One order by its id", "One order, by its id"));
    await until(() => told > 0);
    expect(told).toBe(1);
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === "order")?.description).toBe("One order, by its id");
    await subscription.close();
  }, 30_000);

  it("keeps the tools it started with under --no-watch, and says it tells of no change", async () => {
    const dir = await project();
    const client = new LegacyClient({ name: "editor", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [CLI, "--cwd", dir, "--no-watch"],
        env: ENV,
        stderr: "pipe",
      }),
    );
    closers.push(() => client.close());

    writeFileSync(join(dir, "courier.config.ts"), config(`, agents: { offer: "reads" }`));
    await new Promise((done) => setTimeout(done, 700));

    expect(client.getServerCapabilities()?.tools?.listChanged).toBe(false);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["order"]);
  }, 30_000);
});
