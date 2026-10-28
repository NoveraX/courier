/**
 * @vitest-environment node
 *
 * Where a config is looked for from a folder: there, then in each folder
 * above it, up to the top of the project — its repository, or the root of
 * its workspace — and no further.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CONFIG_BASENAMES, configCandidates } from "../../src/config/config-candidates";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-config-candidates-")));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/* The folders the candidates lie in, each once, in the order they are looked in. */
function foldersOf(candidates: string[]): string[] {
  return [...new Set(candidates.map((candidate) => dirname(candidate)))];
}

describe("configCandidates", () => {
  it("looks for each config name in the folder first, in their order", () => {
    expect(configCandidates(dir).slice(0, CONFIG_BASENAMES.length)).toEqual(
      CONFIG_BASENAMES.map((name) => join(dir, name)),
    );
  });

  it("climbs to the folder that holds the repository, and no further", () => {
    mkdirSync(join(dir, ".git"));
    const web = join(dir, "apps", "web");
    mkdirSync(web, { recursive: true });

    expect(foldersOf(configCandidates(web))).toEqual([web, join(dir, "apps"), dir]);
  });

  it("stops at a worktree, whose .git is a file", () => {
    writeFileSync(join(dir, ".git"), "gitdir: /elsewhere\n");
    const app = join(dir, "app");
    mkdirSync(app);

    expect(foldersOf(configCandidates(app))).toEqual([app, dir]);
  });

  it("stops at the root of a workspace, pnpm's or one a package.json declares", () => {
    const pnpm = join(dir, "pnpm");
    mkdirSync(join(pnpm, "apps", "web"), { recursive: true });
    writeFileSync(join(pnpm, "pnpm-workspace.yaml"), "packages: [apps/*]\n");
    const npm = join(dir, "npm");
    mkdirSync(join(npm, "apps", "web"), { recursive: true });
    writeFileSync(join(npm, "package.json"), '{ "workspaces": ["apps/*"] }\n');

    expect(foldersOf(configCandidates(join(pnpm, "apps", "web"))).at(-1)).toBe(pnpm);
    expect(foldersOf(configCandidates(join(npm, "apps", "web"))).at(-1)).toBe(npm);
  });

  it("climbs past a package that is no workspace's root, and a manifest that does not parse", () => {
    mkdirSync(join(dir, ".git"));
    const app = join(dir, "app");
    mkdirSync(join(app, "src"), { recursive: true });
    writeFileSync(join(app, "package.json"), '{ "name": "app" }\n');
    writeFileSync(join(app, "src", "package.json"), "{ not json");

    expect(foldersOf(configCandidates(join(app, "src")))).toEqual([join(app, "src"), app, dir]);
  });

  it("climbs to the root of the file system when no folder marks the top", () => {
    expect(foldersOf(configCandidates(dir)).at(-1)).toBe(parse(dir).root);
  });
});
