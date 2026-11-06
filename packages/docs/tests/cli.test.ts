/**
 * `courier-docs mcp` as an editor starts it: the official stdio client
 * spawns the built command with the network refused to it, lists its
 * tools, finds the part of the docs that answers a question and reads a
 * page — every answer from the docs the package ships, and nothing tried
 * on the network. The command stops when the client closes its end, and
 * says what it takes on --help.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { beforeAll, describe, expect, it } from "vitest";

import { packageVersion } from "../src/package-version";

const CLI = resolve(import.meta.dirname, "../lib/cli.js");
const DOCS = resolve(import.meta.dirname, "../docs/manifest.json");
const OFFLINE = pathToFileURL(resolve(import.meta.dirname, "support/offline.mjs")).href;
/* A fetch of a port nothing serves — not one of the bad ports fetch refuses before any connect. */
const FETCH = "fetch('http://127.0.0.1:59999').catch(() => {})";

function run(args: readonly string[]) {
  return spawnSync(process.execPath, args, { input: "", encoding: "utf8", timeout: 30_000 });
}

beforeAll(() => {
  if (!existsSync(CLI) || !existsSync(DOCS)) {
    throw new Error("Build @noverax/courier-docs first: its command runs from lib/cli.js on docs/");
  }
});

describe("courier-docs mcp", () => {
  it("serves the docs it ships to an editor's client, with the network refused to it", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", OFFLINE, CLI, "mcp"],
      env: {},
      stderr: "pipe",
    });
    let log = "";
    transport.stderr?.on("data", (chunk: Buffer) => {
      log += chunk.toString();
    });
    const client = new Client({ name: "editor", version: "1.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const search = await client.callTool({
      name: "docs_search",
      arguments: { query: "browsers only", limit: 3 },
    });
    const read = await client.callTool({ name: "docs_read", arguments: { page: "quick-start" } });
    const server = client.getServerVersion();
    await client.close();

    const version = packageVersion();
    expect(server).toMatchObject({ name: "courier-docs", version });
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "docs_list",
      "docs_read",
      "docs_search",
    ]);
    const found = search.structuredContent as { version: string; results: unknown[] };
    expect(found.version).toBe(version);
    expect(found.results[0]).toMatchObject({
      page: "proxy-mode/rate-limits",
      section: "Browsers only",
    });
    const [first] = read.content as { type: string; text: string }[];
    expect(first?.text.startsWith(`Courier ${version} docs · quick-start · Quick Start · `)).toBe(
      true,
    );
    expect(log).toBe("");
  });

  it("stops when the client closes its end, having written nothing", () => {
    const served = run([CLI, "mcp"]);

    expect(served.status).toBe(0);
    expect(served.stdout).toBe("");
    expect(served.stderr).toBe("");
  });

  it("says what it takes on --help, and refuses what it does not", () => {
    const help = run([CLI, "--help"]);
    const unknown = run([CLI, "serve"]);
    const option = run([CLI, "mcp", "--port", "3000"]);

    expect(help.status).toBe(0);
    expect(help.stdout).toContain("courier-docs <command>");
    expect(help.stdout).toContain("npx @noverax/courier-docs mcp");
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('Unknown command "serve". Run courier-docs --help.');
    expect(option.status).toBe(1);
    expect(option.stderr).toContain("courier-docs mcp takes no options, not --port 3000");
  });

  it("is held to no network by the preload: a connect it tries fails, and says so", () => {
    const tried = run(["--import", OFFLINE, "-e", FETCH]);

    expect(tried.stderr).toContain("network refused: connect");
  });
});
