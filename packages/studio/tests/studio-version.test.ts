/**
 * The version Studio reports, from the layout it is published in.
 *
 * It looked its manifest up two directories above the source file; the
 * published chunks sit one directory below it, so every install reported
 * v0.0.0 — and the repository's own 0.0.0 hid that until a release.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";

import { studioVersion } from "../src/server/studio-version";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("studioVersion", () => {
  it("reads the installed manifest from a published lib/ chunk", async () => {
    const root = mkdtempSync(join(tmpdir(), "courier-studio-version-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const pkg = join(root, "node_modules", "@noverax", "courier-studio");
    mkdirSync(join(pkg, "lib"), { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({
        name: "@noverax/courier-studio",
        version: "9.9.9",
        type: "module",
        exports: { "./package.json": "./package.json" },
      }),
    );
    const chunk = join(pkg, "lib", "server-chunk.js");
    await build({
      entryPoints: [join(__dirname, "../src/server/studio-version.ts")],
      bundle: true,
      format: "esm",
      platform: "node",
      outfile: chunk,
      logLevel: "silent",
    });

    const published: { studioVersion: typeof studioVersion } = await import(
      pathToFileURL(chunk).href
    );

    expect(published.studioVersion()).toBe("9.9.9");
  });

  it("reads the manifest of this package from source", async () => {
    const { default: manifest } = await import("../package.json", { with: { type: "json" } });

    expect(studioVersion()).toBe(manifest.version);
  });
});
