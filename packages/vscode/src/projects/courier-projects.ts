import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import * as vscode from "vscode";

import { LOCKFILES, packageManagerOf, studioCommand } from "./start-command";

/** A project of the workspace that Courier is set up in: a folder with a `courier.config`. */
export interface CourierProject {
  readonly root: string;
  /** The `name` in its `package.json`, or its folder's */
  readonly name: string;
  /** The workspace folder it is in, where a search above it stops */
  readonly workspace: string;
}

/** The projects of the workspace, found once and again whenever a config comes or goes. */
export interface CourierProjects extends vscode.Disposable {
  list(): Promise<readonly CourierProject[]>;
  /** The project a file belongs to: the nearest one above it */
  projectOf(file: string): Promise<CourierProject | undefined>;
  readonly onDidChange: vscode.Event<void>;
}

const CONFIGS = "**/courier.config.{ts,mts,cts,js,mjs,cjs}";
/* Folders that hold installed or built copies, never a project of the user's. */
const SKIPPED =
  "**/{node_modules,.git,dist,build,.next,.nuxt,.output,.svelte-kit,.turbo,coverage}/**";
const MOST_PROJECTS = 50;

/**
 * The Courier projects of the workspace: each folder with a `courier.config`
 * — several in a monorepo — kept up to date as configs are added and removed.
 *
 * @returns The projects
 * @example
 * ```ts
 * const projects = createCourierProjects();
 * (await projects.list()).map((p) => p.name); // ["shop", "admin"]
 * ```
 */
export function createCourierProjects(): CourierProjects {
  let found: Promise<CourierProject[]> | undefined;
  const changed = new vscode.EventEmitter<void>();
  const watcher = vscode.workspace.createFileSystemWatcher(CONFIGS, false, true, false);
  const forget = () => {
    found = undefined;
    changed.fire();
  };
  const held = [
    watcher,
    watcher.onDidCreate(forget),
    watcher.onDidDelete(forget),
    vscode.workspace.onDidChangeWorkspaceFolders(forget),
  ];
  const list = () => {
    found ??= discover();
    return found;
  };
  return {
    list,
    async projectOf(file) {
      const holding = (await list()).filter(
        (project) => file === project.root || file.startsWith(project.root + sep),
      );
      return holding.sort((a, b) => b.root.length - a.root.length)[0];
    },
    onDidChange: changed.event,
    dispose() {
      for (const each of held) each.dispose();
      changed.dispose();
    },
  };
}

/**
 * The command that starts Courier Studio for a project: its own `studio`
 * script through the package manager its lockfile names, when that script
 * runs Courier Studio, or the package by its full name.
 *
 * @param project - The project
 * @returns The command line
 * @example
 * ```ts
 * await studioCommandFor(project); // "pnpm run studio"
 * ```
 */
export async function studioCommandFor(project: CourierProject): Promise<string> {
  const manifest = await readJson(join(project.root, "package.json"));
  const scripts = manifest?.scripts;
  const lockfiles: string[][] = [];
  for (let dir = project.root; ; dir = dirname(dir)) {
    const files = await readdir(dir).catch(() => []);
    lockfiles.push(files.filter((file) => LOCKFILES.has(file)));
    if (dir === project.workspace || dirname(dir) === dir) break;
  }
  return studioCommand(packageManagerOf(lockfiles), isRecord(scripts) ? scripts : {});
}

async function discover(): Promise<CourierProject[]> {
  const configs = await vscode.workspace.findFiles(CONFIGS, SKIPPED, MOST_PROJECTS);
  const roots = [...new Set(configs.map((config) => dirname(config.fsPath)))].sort();
  return Promise.all(
    roots.map(async (root) => {
      const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root));
      const manifest = await readJson(join(root, "package.json"));
      const name = typeof manifest?.name === "string" ? manifest.name : basename(root);
      return { root, name, workspace: folder?.uri.fsPath ?? root };
    }),
  );
}

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    /* No manifest there, or one being written: the project goes by its folder's name. */
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
