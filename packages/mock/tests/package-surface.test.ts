/**
 * What the package ships is what its entry points reach. Code no entry
 * reaches is dead weight in the bundle, and a peer dependency only such code
 * needs asks every consumer for a package nothing uses.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const ENTRIES = [
  "src/index.ts",
  "src/testing.ts",
  "src/server/index.ts",
  "src/contract/index.ts",
  "src/managed/index.ts",
];
const VALUE_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+"([^"]+)"/g;
const DYNAMIC_IMPORT = /\bimport\(\s*"([^"]+)"\s*\)/g;

function resolveModule(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier);
  return [`${base}.ts`, join(base, "index.ts")].find((file) => existsSync(file));
}

/** Every source file the entries reach through value imports, and each bare module they import */
function reachable(): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = ENTRIES.map((entry) => join(ROOT, entry));
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    const text = readFileSync(file, "utf8");
    for (const [, specifier = ""] of [...text.matchAll(VALUE_IMPORT), ...text.matchAll(DYNAMIC_IMPORT)]) {
      if (!specifier.startsWith(".")) packages.add(specifier);
      const target = specifier.startsWith(".") ? resolveModule(file, specifier) : undefined;
      if (target) queue.push(target);
    }
  }
  return { files, packages };
}

describe("the package surface", () => {
  it("ships no Studio socket bridge: managed mocks talk to Studio over IPC", () => {
    const { files, packages } = reachable();

    expect([...files].map((file) => relative(ROOT, file)).filter((f) => f.startsWith("src/studio/"))).toEqual([]);
    expect(packages.has("socket.io-client")).toBe(false);
  });

  it("asks no consumer for socket.io-client", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

    expect(Object.keys(manifest.peerDependencies ?? {})).not.toContain("socket.io-client");
    expect(Object.keys(manifest.peerDependenciesMeta ?? {})).not.toContain("socket.io-client");
  });
});
