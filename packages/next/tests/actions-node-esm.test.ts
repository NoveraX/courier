/**
 * The request headers a server action forwards are read from next/headers,
 * imported where the action runs. Next ships no exports map, so Node's own
 * ESM loader finds that module by its file name alone: imported without the
 * extension, a server that did not bundle the package forwarded no headers
 * at all, and said so only at debug level. This reads the built package,
 * which is what such a server runs.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const LIB = fileURLToPath(new URL("../lib/", import.meta.url));

function importedHeaderModules(): string[] {
  const built = readdirSync(LIB)
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(`${LIB}${file}`, "utf8"))
    .join("\n");
  return [...built.matchAll(/import\(\s*["'](next\/headers[^"']*)["']\s*\)/g)].map((m) => m[1] ?? "");
}

function nodeResolves(specifier: string): boolean {
  const code = `await import(${JSON.stringify(specifier)});`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: PACKAGE }).status === 0;
}

describe("the module a server action reads request headers from", () => {
  it("is imported by a name Node's own loader resolves", () => {
    const specifiers = importedHeaderModules();

    expect(specifiers).toEqual(["next/headers.js"]);
    expect(specifiers.every(nodeResolves)).toBe(true);
    expect(nodeResolves("next/headers")).toBe(false);
  });
});
