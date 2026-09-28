/**
 * How the release driver publishes and prepares. `npm publish packages/core`
 * reads to npm as the GitHub repository `packages/core`, so every package
 * failed to publish; and the lockfile was left at the old versions, so the
 * release commit's lockfile did not describe its packages.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { LOCKFILE_SYNC, publishCommand } from "./release.ts";

describe("publishCommand", () => {
  it("runs npm in the package's folder, never naming the folder", () => {
    const { args, cwd } = publishCommand("packages/core", "latest", { provenance: false, dryRun: false });

    expect(cwd).toBe(resolve("packages/core"));
    expect(args).toEqual(["publish", "--access", "public", "--tag", "latest"]);
  });

  it("asks for provenance, or only shows what would be sent, when told to", () => {
    expect(publishCommand("packages/core", "beta", { provenance: true, dryRun: false }).args).toContain(
      "--provenance",
    );
    expect(publishCommand("packages/core", "beta", { provenance: false, dryRun: true }).args).toContain("--dry-run");
  });
});

describe("a release commit", () => {
  it("carries the lockfile, brought to the new versions", () => {
    const config = JSON.parse(readFileSync(".releaserc.json", "utf8"));
    const git = config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "@semantic-release/git");

    expect(git[1].assets).toContain("package-lock.json");
    expect(LOCKFILE_SYNC).toEqual(["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"]);
  });
});
