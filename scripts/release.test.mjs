/**
 * How the release driver publishes and prepares. `npm publish packages/core`
 * reads to npm as the GitHub repository `packages/core`, so every package
 * failed to publish; and the lockfile was left at the old versions, so the
 * release commit's lockfile did not describe its packages.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import commitRules from "./commit-rules.cjs";
import { LOCKFILE_SYNC, publishCommand, versionedDirs } from "./release.ts";

const { bodyNoLabelLines } = commitRules;

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

  it("is deployed like any other push, so the sites show the version it writes", () => {
    const config = JSON.parse(readFileSync(".releaserc.json", "utf8"));
    const git = config.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "@semantic-release/git",
    );

    /* The keywords a host skips a deployment for, as GitHub skips a workflow run. */
    for (const skip of ["[skip ci]", "[ci skip]", "[no ci]", "[skip actions]", "[actions skip]"]) {
      expect(git[1].message).not.toContain(skip);
    }
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
  const config = JSON.parse(readFileSync(".releaserc.json", "utf8"));
  const options = (name) => config.plugins.find((plugin) => plugin[0] === name)?.[1] ?? {};
  const quiet = { log() {}, error() {}, success() {}, warn() {} };
  /* A folder with no notes written by hand: the repository's own holds
     some for a version a test names, and those would stand in for the
     generated notes the test reads. */
  const bare = mkdtempSync(join(tmpdir(), "courier-release-bare-"));
  afterAll(() => rmSync(bare, { recursive: true, force: true }));
  const release = (commits, version = "0.2.0", cwd = bare) => ({
    cwd,
    env: {},
    logger: quiet,
    commits: commits.map((message, at) => ({ hash: String(at).repeat(40), message })),
    lastRelease: { gitTag: "v0.1.0", version: "0.1.0", gitHead: "" },
    nextRelease: { gitTag: `v${version}`, version },
    options: { repositoryUrl: "https://github.com/NoveraX/courier" },
  });

  it("come out of the preset and the writer the release loads, sorted by type", async () => {
    const { analyzeCommits } = await import("@semantic-release/commit-analyzer");
    const { generateNotes } = await import("./release-notes.mjs");
    const context = release([
      "feat(core): ✨ answer in one line",
      "fix(studio): 🐛 keep the open request",
    ]);

    const type = await analyzeCommits(options("@semantic-release/commit-analyzer"), context);
    const notes = await generateNotes(options("./scripts/release-notes.mjs"), context);

    expect(type).toBe("minor");
    expect(notes).toContain("### Features");
    expect(notes).toContain("**core:** ✨ answer in one line");
    expect(notes).toContain("### Bug Fixes");
  });

  it("leave out, and release nothing for, work on the site, the examples and the tooling", async () => {
    const { analyzeCommits } = await import("@semantic-release/commit-analyzer");
    const { generateNotes } = await import("./release-notes.mjs");
    const internal = release([
      "feat(site): ✨ show the quick start first",
      "fix(examples): 🐛 pack the demo's MCP server",
      "fix(scripts): 🐛 read the paths Windows gives",
    ]);
    const mixed = release(["fix(docs,core): 🐛 name the option the guide shows"]);

    expect(await analyzeCommits(options("@semantic-release/commit-analyzer"), internal)).toBe(null);
    expect(await generateNotes(options("./scripts/release-notes.mjs"), internal)).not.toMatch(
      /quick start|MCP server|Windows/,
    );
    expect(await analyzeCommits(options("@semantic-release/commit-analyzer"), mixed)).toBe("patch");
    expect(await generateNotes(options("./scripts/release-notes.mjs"), mixed)).toContain(
      "name the option the guide shows",
    );
  });

  it("leave out the scopes the release does not release for", () => {
    const silent = options("@semantic-release/commit-analyzer")
      .releaseRules.filter((rule) => rule.release === false)
      .map((rule) => rule.scope);

    expect(options("./scripts/release-notes.mjs").leaveOut).toEqual(silent);
  });

  it("are those written for the release, where there are some, under the generated heading", async () => {
    const { generateNotes } = await import("./release-notes.mjs");
    const cwd = mkdtempSync(join(tmpdir(), "courier-release-notes-"));
    mkdirSync(join(cwd, ".github", "release-notes"), { recursive: true });
    writeFileSync(join(cwd, ".github", "release-notes", "v0.2.0.md"), "Written by hand.\n");

    const notes = await generateNotes(
      options("./scripts/release-notes.mjs"),
      release(["fix(core): 🐛 keep the cookie"], "0.2.0", cwd),
    );
    rmSync(cwd, { recursive: true, force: true });

    expect(notes).toMatch(
      /^## \[0\.2\.0\]\(https:\/\/github\.com\/NoveraX\/courier\/compare\/v0\.1\.0\.\.\.v0\.2\.0\)/,
    );
    expect(notes).toContain("\n\nWritten by hand.\n");
    expect(notes).not.toContain("keep the cookie");
  });

  it("for 0.1.0 are written by hand, and read as a commit's body the checks accept", () => {
    const written = readFileSync(".github/release-notes/v0.1.0.md", "utf8");

    expect(written).toContain("Courier's first public release.");
    expect(bodyNoLabelLines({ body: written, footer: null })).toEqual([true, ""]);
  });

  it("written by hand for any release read as a commit's body the checks accept", () => {
    const folder = join(".github", "release-notes");
    const written = readdirSync(folder).filter((name) => name.endsWith(".md"));

    expect(written).toContain("v0.2.0.md");
    for (const name of written) {
      const body = readFileSync(join(folder, name), "utf8");
      expect(bodyNoLabelLines({ body, footer: null }), name).toEqual([true, ""]);
    }
  });
});
