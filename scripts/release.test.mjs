/**
 * How the release driver publishes and prepares. `npm publish packages/core`
 * reads to npm as the GitHub repository `packages/core`, so every package
 * failed to publish; and the lockfile was left at the old versions, so the
 * release commit's lockfile did not describe its packages.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { LOCKFILE_SYNC, publishCommand, versionedDirs } from "./release.ts";

describe("publishCommand", () => {
  it("runs npm in the package's folder, never naming the folder", () => {
    const { args, cwd } = publishCommand("packages/core", "latest", {
      provenance: false,
      dryRun: false,
    });

    expect(cwd).toBe(resolve("packages/core"));
    expect(args).toEqual(["publish", "--access", "public", "--tag", "latest"]);
  });

  it("asks for provenance, or only shows what would be sent, when told to", () => {
    expect(
      publishCommand("packages/core", "beta", { provenance: true, dryRun: false }).args,
    ).toContain("--provenance");
    expect(
      publishCommand("packages/core", "beta", { provenance: false, dryRun: true }).args,
    ).toContain("--dry-run");
  });
});

describe("a release commit", () => {
  it("carries the lockfile, brought to the new versions", () => {
    const config = JSON.parse(readFileSync(".releaserc.json", "utf8"));
    const git = config.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "@semantic-release/git",
    );

    expect(git[1].assets).toContain("package-lock.json");
    expect(LOCKFILE_SYNC).toEqual([
      "install",
      "--package-lock-only",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ]);
  });
});

describe("the version a release writes", () => {
  it("goes into every package and both editor extensions", () => {
    expect(versionedDirs("0.1.0", ["packages/core"], ["packages/vscode"])).toEqual([
      "packages/core",
      "packages/vscode",
    ]);
  });

  /* The marketplaces refuse a version with a prerelease part. */
  it("leaves the extensions as they were for a prerelease", () => {
    expect(versionedDirs("0.2.0-beta.1", ["packages/core"], ["packages/vscode"])).toEqual([
      "packages/core",
    ]);
  });
});

describe("semantic-release's npm plugin, which a release leaves out", () => {
  it("is never run: the release names its plugins, and that one is not among them", () => {
    const config = JSON.parse(readFileSync(".releaserc.json", "utf8"));
    const names = config.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));

    expect(names).toContain("@semantic-release/exec");
    expect(names).not.toContain("@semantic-release/npm");
  });

  it("is stood in for by a folder that installs nothing and stops a release that loads it", async () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const stand = JSON.parse(
      readFileSync("scripts/stubs/semantic-release-npm/package.json", "utf8"),
    );

    expect(manifest.devDependencies["@semantic-release/npm"]).toBe(
      "file:./scripts/stubs/semantic-release-npm",
    );
    expect(manifest.overrides).toEqual({ "@semantic-release/npm": "$@semantic-release/npm" });
    expect(stand).toMatchObject({ name: "@semantic-release/npm", private: true });
    expect(stand).not.toHaveProperty("dependencies");
    await expect(import("@semantic-release/npm")).rejects.toThrow(
      "Courier publishes with scripts/release.ts",
    );
  });
});

describe("the notes a release writes", () => {
  it("come out of the preset and the writer the release loads, sorted by type", async () => {
    const config = JSON.parse(readFileSync(".releaserc.json", "utf8"));
    const options = (name) => config.plugins.find((plugin) => plugin[0] === name)?.[1] ?? {};
    const { analyzeCommits } = await import("@semantic-release/commit-analyzer");
    const { generateNotes } = await import("@semantic-release/release-notes-generator");
    const quiet = { log() {}, error() {}, success() {}, warn() {} };
    const context = {
      cwd: process.cwd(),
      env: {},
      logger: quiet,
      commits: [
        { hash: "a".repeat(40), message: "feat(core): ✨ answer in one line" },
        { hash: "b".repeat(40), message: "fix(studio): 🐛 keep the open request" },
      ],
      lastRelease: { gitTag: "v0.1.0", version: "0.1.0", gitHead: "" },
      nextRelease: { gitTag: "v0.2.0", version: "0.2.0" },
      options: { repositoryUrl: "https://github.com/NoveraX/courier" },
    };

    const type = await analyzeCommits(options("@semantic-release/commit-analyzer"), context);
    const notes = await generateNotes(
      options("@semantic-release/release-notes-generator"),
      context,
    );

    expect(type).toBe("minor");
    expect(notes).toContain("### Features");
    expect(notes).toContain("**core:** ✨ answer in one line");
    expect(notes).toContain("### Bug Fixes");
  });
});
