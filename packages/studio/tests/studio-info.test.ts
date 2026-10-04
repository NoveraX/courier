/**
 * What a page is told of Studio when it connects: Studio's version, when it
 * started, and the project by its package's name — or its folder's, when the
 * package names none or cannot be read — with the packages it depends on.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioInfo } from "../src/server/studio-info";

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(packageJson?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-info-"));
  dirs.push(dir);
  if (packageJson !== undefined) writeFileSync(join(dir, "package.json"), packageJson);
  return dir;
}

describe("studioInfo", () => {
  it("names the project after its package, and carries Studio's version and start", () => {
    const root = project(JSON.stringify({ name: " acme-web " }));

    expect(studioInfo(root, "1.2.3", 1_700)).toEqual({
      version: "1.2.3",
      startedAt: 1_700,
      project: { name: "acme-web", dependencies: [] },
    });
  });

  it("lists the packages the project depends on, dev ones included, once each and sorted", () => {
    const root = project(
      JSON.stringify({
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        devDependencies: { vite: "^7.0.0", react: "^19.0.0" },
        peerDependencies: { typescript: "*" },
      }),
    );

    expect(studioInfo(root, "1.2.3").project.dependencies).toEqual(["react", "react-dom", "vite"]);
  });

  it("lists no packages when the manifest has no usable dependency maps, or none at all", () => {
    for (const manifest of [
      undefined,
      "{ not json",
      "[]",
      JSON.stringify({ dependencies: ["react"], devDependencies: "vite" }),
    ]) {
      expect(studioInfo(project(manifest), "1.2.3").project.dependencies).toEqual([]);
    }
  });

  it("names the project after its folder when the package names nothing usable", () => {
    for (const manifest of [
      undefined,
      "{}",
      JSON.stringify({ name: "" }),
      JSON.stringify({ name: 7 }),
    ]) {
      const root = project(manifest);

      expect(studioInfo(root, "1.2.3").project.name).toBe(basename(root));
    }
  });

  it("names the project after its folder, and says why at debug, when package.json is not JSON", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");
    const root = project("{ not json");

    expect(studioInfo(root, "1.2.3").project.name).toBe(basename(root));
    expect(debug).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("carries the installed version and the moment it is built when neither is given", () => {
    const before = Date.now();

    const info = studioInfo(project());

    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.startedAt).toBeGreaterThanOrEqual(before);
    expect(info.startedAt).toBeLessThanOrEqual(Date.now());
  });
});
