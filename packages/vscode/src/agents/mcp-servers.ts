import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as vscode from "vscode";

import type { CourierProject, CourierProjects } from "../projects/courier-projects";
import { type McpApi, type McpStdioDefinition, mcpApi } from "./mcp-api";

/** Each server the extension offers, and the package a project needs installed to run it. */
const SERVERS = [
  { name: "API", pkg: "@noverax/courier-mcp", args: [], env: true },
  { name: "Studio", pkg: "@noverax/courier-studio", args: ["mcp"], env: false },
] as const;

/*
 * The API's server calls the backend with the project's variables, which no
 * editor loads: the files there are named to it, the one that wins first —
 * a variable keeps the first value it is given.
 */
const ENV_FILES = [".env.development.local", ".env.local", ".env.development", ".env"];

/**
 * Offer VS Code's agent the MCP servers of each Courier project in the
 * workspace: the project's API, as tools — the endpoints its `agents`
 * policy offers — and its running Studio, whose recorded requests, audit
 * and mocks the agent reads. Each is offered for a project that has its
 * package installed, runs from the project's folder, and starts only when
 * the agent first needs it. In an editor without VS Code's MCP API, nothing
 * is offered and nothing fails.
 *
 * @param projects - The workspace's Courier projects
 * @param enabled - Whether the settings let the servers be offered
 * @returns What stops offering them
 * @example
 * ```ts
 * context.subscriptions.push(offerMcpServers(projects, () => true));
 * ```
 */
export function offerMcpServers(
  projects: CourierProjects,
  enabled: () => boolean,
): vscode.Disposable {
  const api = mcpApi();
  if (!api) return { dispose: () => undefined };
  const changed = new vscode.EventEmitter<void>();
  const settings = vscode.workspace.onDidChangeConfiguration((change) => {
    if (change.affectsConfiguration("courier.agents")) changed.fire();
  });
  const registration = api.register("courier", {
    onDidChangeMcpServerDefinitions: changed.event,
    async provideMcpServerDefinitions() {
      if (!enabled()) return [];
      const all = await Promise.all(
        (await projects.list()).map((project) => definitionsOf(api, project)),
      );
      return all.flat();
    },
  });
  const projectsChanged = projects.onDidChange(() => changed.fire());
  return vscode.Disposable.from(registration, projectsChanged, settings, changed);
}

/* The servers a project has installed, each to run from its folder. */
async function definitionsOf(api: McpApi, project: CourierProject): Promise<McpStdioDefinition[]> {
  const offered: McpStdioDefinition[] = [];
  for (const server of SERVERS) {
    const version = await installedVersion(project, server.pkg);
    if (version === undefined) continue;
    const label = `Courier ${server.name} · ${project.name}`;
    const env = server.env ? await envArgs(project) : [];
    const [command, ...args] = npx([server.pkg, ...server.args, ...env]);
    const definition = new api.Definition(label, command, args, {}, version);
    definition.cwd = vscode.Uri.file(project.root);
    offered.push(definition);
  }
  return offered;
}

async function envArgs(project: CourierProject): Promise<string[]> {
  const present = await Promise.all(
    ENV_FILES.map((file) =>
      access(join(project.root, file)).then(
        () => file,
        () => undefined,
      ),
    ),
  );
  const files = present.filter((file) => file !== undefined);
  return files.length > 0 ? ["--dotenv", files.join(",")] : [];
}

/* npx by its command line: Windows runs npx.cmd only through cmd, which a server process is not started in. */
function npx(args: readonly string[]): [string, ...string[]] {
  return process.platform === "win32" ? ["cmd", "/c", "npx", ...args] : ["npx", ...args];
}

/* The version of a package the project resolves, from its folder up to the workspace's — a monorepo hoists them. */
async function installedVersion(project: CourierProject, pkg: string): Promise<string | undefined> {
  for (let dir = project.root; ; dir = dirname(dir)) {
    const manifest = await readFile(join(dir, "node_modules", pkg, "package.json"), "utf8").catch(
      () => undefined,
    );
    if (manifest !== undefined) return versionIn(manifest);
    if (dir === project.workspace || dirname(dir) === dir) return undefined;
  }
}

/* A manifest that cannot be read still says the package is there: VS Code restarts the server when the version changes. */
function versionIn(manifest: string): string {
  try {
    const parsed: unknown = JSON.parse(manifest);
    if (typeof parsed !== "object" || parsed === null) return "0.0.0";
    const version: unknown = Reflect.get(parsed, "version");
    return typeof version === "string" ? version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
