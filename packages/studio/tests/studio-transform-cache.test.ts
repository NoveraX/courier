/**
 * Which transform cache Studio loads a project through: one per process for
 * each directory transforms are kept in, and one shared by every project
 * that has none.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioTransformCache } from "../src/server/studio-transform-cache";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-studio-transform-cache-")));
  vi.stubEnv("COURIER_TRANSFORM_CACHE", "on");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

/** A project root, with a node_modules of its own when asked. */
function root(name: string, { nodeModules = false } = {}): string {
  const path = join(dir, name);
  mkdirSync(nodeModules ? join(path, "node_modules") : path, { recursive: true });
  return path;
}

describe("studioTransformCache", () => {
  it("hands every load of a project the same cache", () => {
    const project = root("app", { nodeModules: true });

    expect(studioTransformCache(project)).toBe(studioTransformCache(project));
  });

  it("hands projects that share a node_modules one cache", () => {
    mkdirSync(join(dir, "node_modules"));

    expect(studioTransformCache(root("web"))).toBe(studioTransformCache(root("api")));
  });

  it("keeps a separate cache for a project with a node_modules of its own", () => {
    mkdirSync(join(dir, "node_modules"));

    expect(studioTransformCache(root("web"))).not.toBe(studioTransformCache(root("api", { nodeModules: true })));
  });

  it("hands every project with no directory the one memory-only cache", () => {
    vi.stubEnv("COURIER_TRANSFORM_CACHE", "off");

    expect(studioTransformCache(root("web"))).toBe(studioTransformCache(root("api", { nodeModules: true })));
  });

  it("looks the directory up again on each call, so turning it off takes effect at the next load", () => {
    const project = root("app", { nodeModules: true });
    const onDisk = studioTransformCache(project);

    vi.stubEnv("COURIER_TRANSFORM_CACHE", "off");

    expect(studioTransformCache(project)).not.toBe(onDisk);
  });
});
