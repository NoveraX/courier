/**
 * `courier-studio --cwd <dir>`, run from another folder: Studio's docs
 * tool, asked over its MCP endpoint, answers with the docs the project in
 * that folder installs — their folder, their index and their version
 * beside its Courier's — found from the project's root, not from where the
 * command was run.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "../../src/cli.ts");
/* The server runs the UI's own modules, imported as `@/...`: tsx finds that path in Studio's
   tsconfig only when told where it is. */
const ENV = {
  ...process.env,
  NO_COLOR: "1",
  TSX_TSCONFIG_PATH: join(import.meta.dirname, "../../tsconfig.json"),
};
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const INDEX = "# Courier 0.4.0 docs\n\n- [Quick Start](quick-start.md): set Courier up\n";

const work = realpathSync(mkdtempSync(join(tmpdir(), "courier-studio-docs-cwd-")));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/* A project that installs Courier and its docs, each at 0.4.0, in a folder of its own. */
function project(): string {
  const root = join(work, "shop");
  writeFileSync(join(mkdirAll(root), "package.json"), JSON.stringify({ name: "shop" }));
  for (const name of ["@noverax/courier", "@noverax/courier-docs"]) {
    const manifest = { name, version: "0.4.0", exports: { "./package.json": "./package.json" } };
    writeFileSync(
      join(mkdirAll(join(root, "node_modules", name)), "package.json"),
      JSON.stringify(manifest),
    );
  }
  writeFileSync(
    join(mkdirAll(join(root, "node_modules/@noverax/courier-docs/docs")), "index.md"),
    INDEX,
  );
  return root;
}

function mkdirAll(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  if (address === null || typeof address === "string") throw new Error("the probe has no port");
  return address.port;
}

async function healthy(port: number, budgetMs: number): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = await fetch(`http://127.0.0.1:${port}/api/health`).then(
      (response) => response.ok,
      () => false,
    );
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

describe("courier-studio --cwd <dir>", () => {
  it("answers its docs tool with the docs the project in that folder installs", async () => {
    const root = project();
    const elsewhere = mkdirAll(join(work, "elsewhere"));
    const port = await freePort();
    const child = spawn(
      process.execPath,
      ["--import", TSX, CLI, "--cwd", root, "--port", String(port), "--host", "127.0.0.1"],
      { cwd: elsewhere, env: ENV },
    );
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
    try {
      const listening = await Promise.race([healthy(port, 15_000), exited.then(() => false)]);
      expect(listening).toBe(true);
      const token = readFileSync(join(root, ".courier/studio-token"), "utf8").trim();
      const client = new Client(
        { name: "editor", version: "1" },
        { versionNegotiation: { mode: { pin: "2026-07-28" } } },
      );
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${token}` } },
        }) as never,
      );
      const docs = await client.callTool({ name: "docs", arguments: {} });
      await client.close();

      expect(docs.structuredContent).toMatchObject({
        installed: true,
        version: "0.4.0",
        courier: "0.4.0",
        matches: true,
        folder: join("node_modules", "@noverax", "courier-docs", "docs"),
        index: INDEX,
      });
    } finally {
      child.kill("SIGTERM");
      await exited;
    }
  }, 30_000);
});
