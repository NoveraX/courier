/**
 * The MCP servers offered to VS Code's agent: for each Courier project, the
 * API's server when it has @noverax/courier-mcp installed — handed the
 * project's .env files, which no editor loads — and Studio's when it has
 * Studio installed, each run from the project's folder, a monorepo's hoisted
 * packages found too. Nothing in an editor without the API, nothing when
 * the settings say so.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { offerMcpServers } from "../src/agents/mcp-servers";
import type { CourierProjects } from "../src/projects/courier-projects";
import { EventEmitter, lm, type McpStdioServerDefinition, Uri } from "./vscode-stand-in";

const workspace = mkdtempSync(join(tmpdir(), "courier-mcp-"));
const root = join(workspace, "apps/shop");
const installed = (dir: string, pkg: string, version: string) => {
  mkdirSync(join(dir, "node_modules", pkg), { recursive: true });
  writeFileSync(join(dir, "node_modules", pkg, "package.json"), JSON.stringify({ version }));
};
installed(root, "@noverax/courier-mcp", "1.2.3");
installed(workspace, "@noverax/courier-studio", "2.0.0");
writeFileSync(join(root, ".env"), "API_URL=http://localhost:4501\n");
writeFileSync(join(root, ".env.local"), "API_URL=http://localhost:4600\n");

const project = { root, name: "shop", workspace };
const changed = new EventEmitter<void>();
const projects = {
  list: async () => [project],
  projectOf: async () => project,
  onDidChange: changed.event,
  dispose: () => undefined,
} as unknown as CourierProjects;
const npx = (...args: string[]) =>
  process.platform === "win32" ? ["cmd", "/c", "npx", ...args] : ["npx", ...args];

interface Provider {
  provideMcpServerDefinitions(): Promise<McpStdioServerDefinition[]>;
}

function registered(enabled: boolean): Provider {
  let provider: Provider | undefined;
  lm.registerMcpServerDefinitionProvider = (id, given) => {
    expect(id).toBe("courier");
    provider = given as Provider;
    return { dispose: () => undefined };
  };
  offerMcpServers(projects, () => enabled);
  if (!provider) throw new Error("no provider was registered");
  return provider;
}

afterEach(() => {
  lm.registerMcpServerDefinitionProvider = undefined;
});
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe("the MCP servers offered to VS Code's agent", () => {
  it("offers the API's and Studio's servers a project has installed, from its folder", async () => {
    const [api, studio] = await registered(true).provideMcpServerDefinitions();

    const [command, ...args] = npx("@noverax/courier-mcp", "--dotenv", ".env.local,.env");
    expect(api).toMatchObject({ label: "Courier API · shop", command, args, version: "1.2.3" });
    expect(api?.cwd).toEqual(Uri.file(root));
    const [studioCommand, ...studioArgs] = npx("@noverax/courier-studio", "mcp");
    expect(studio).toMatchObject({
      label: "Courier Studio · shop",
      command: studioCommand,
      args: studioArgs,
      version: "2.0.0",
    });
  });

  it("offers none when the settings turn them off", async () => {
    expect(await registered(false).provideMcpServerDefinitions()).toEqual([]);
  });

  it("registers nothing in an editor without VS Code's agent API", () => {
    expect(() => offerMcpServers(projects, () => true).dispose()).not.toThrow();
  });
});
