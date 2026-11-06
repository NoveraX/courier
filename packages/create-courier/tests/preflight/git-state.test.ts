import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { gitState } from "../../src/preflight/git-state";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

/* git, run in a folder as a person would, with a name to commit under. */
function git(cwd: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, stdio: "ignore" },
  );
}

/* A repository with the files given, all committed. */
function repository(files: Readonly<Record<string, string>>): string {
  const root = projectWith(files);
  git(root, "init", "--quiet");
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "--no-verify", "-m", "start");
  return root;
}

describe("gitState", () => {
  it.skipIf(process.platform === "win32")(
    "runs no fsmonitor the repository's config names",
    async () => {
      const root = repository({ "package.json": "{}\n" });
      const ran = join(root, ".git", "fsmonitor-ran");
      const hook = join(root, ".git", "fsmonitor-hook");
      writeFileSync(hook, `#!/bin/sh\ntouch "${ran}"\n`, { mode: 0o755 });
      git(root, "config", "core.fsmonitor", hook);

      expect(await gitState(root)).toEqual({ kind: "clean" });
      expect(existsSync(ran)).toBe(false);
    },
  );

  it("tells a folder outside a repository whatever language git speaks", async () => {
    const outside = projectWith({ "package.json": "{}\n" });
    const was = { LANGUAGE: process.env.LANGUAGE, LC_ALL: process.env.LC_ALL };
    process.env.LANGUAGE = "de";
    process.env.LC_ALL = "de_DE.UTF-8";

    try {
      expect(await gitState(outside, "git")).toMatchObject({
        kind: "unknown",
        why: "it is not in a git repository, so there is no history to go back to",
      });
    } finally {
      for (const [name, value] of Object.entries(was))
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
  });

  it("is clean where everything is committed", async () => {
    expect(await gitState(repository({ "package.json": "{}\n" }))).toEqual({ kind: "clean" });
  });

  it("names the changes not committed, those git does not track among them, and counts them all", async () => {
    const root = repository({ "package.json": "{}\n", "src/app.ts": "app\n" });
    writeFileSync(join(root, "src/app.ts"), "changed\n");
    for (let at = 0; at < 6; at++) writeFileSync(join(root, `new-${at}.ts`), "new\n");

    const state = await gitState(root);

    expect(state).toMatchObject({ kind: "dirty", count: 7 });
    expect(state.kind === "dirty" && state.paths).toHaveLength(5);
    expect(state.kind === "dirty" && state.paths).toContain("src/app.ts");
  });

  it("looks at the project's own folder alone, in a repository that holds more", async () => {
    const root = repository({ "apps/web/package.json": "{}\n", "apps/api/package.json": "{}\n" });
    writeFileSync(join(root, "apps/api/package.json"), '{ "name": "api" }\n');

    expect(await gitState(join(root, "apps/web"))).toEqual({ kind: "clean" });
  });

  it("says there is no history to go back to outside a repository, and where git is not installed", async () => {
    const outside = projectWith({ "package.json": "{}\n" });
    mkdirSync(join(outside, "src"));

    expect(await gitState(outside)).toEqual({
      kind: "unknown",
      why: "it is not in a git repository, so there is no history to go back to",
    });
    expect(await gitState(outside, "courier-no-such-git")).toEqual({
      kind: "unknown",
      why: "git is not installed, so there is no history to go back to",
    });
  });
});
