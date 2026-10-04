/**
 * The notices a bundle ships with: which package a module comes from, what
 * the package says of its licence, and the file that lists them all.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { formatNotices, packageRootOf, readBundledPackage } from "./third-party-licenses.ts";

const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function packageDir(manifest, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "courier-notices-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const nm = (...parts) => [sep, "app", "node_modules", ...parts].join(sep).replace(sep + sep, sep);

describe("packageRootOf", () => {
  it("finds a package, a scoped one, and a nested dependency's own", () => {
    expect(packageRootOf(nm("react", "index.js"))).toBe(nm("react"));
    expect(packageRootOf(nm("@scope", "pkg", "dist", "a.js"))).toBe(nm("@scope", "pkg"));
    expect(packageRootOf(nm("a", "node_modules", "b", "x.js"))).toBe(nm("a", "node_modules", "b"));
  });

  it("ignores a virtual-module prefix and a query string", () => {
    expect(packageRootOf(`\0${nm("react", "index.js")}?commonjs-proxy`)).toBe(nm("react"));
  });

  it("is null for a module of the project itself", () => {
    expect(packageRootOf([sep, "app", "src", "main.tsx"].join(sep))).toBeNull();
  });
});

describe("readBundledPackage", () => {
  it("reads the name, version, licence and its text", () => {
    const dir = packageDir(
      { name: "geist", version: "1.0.0", license: "OFL-1.1" },
      { LICENSE: "SIL Open Font License\n" },
    );

    expect(readBundledPackage(dir)).toEqual({
      name: "geist",
      version: "1.0.0",
      license: "OFL-1.1",
      text: "SIL Open Font License",
    });
  });

  it("says so when a package ships no licence file", () => {
    const dir = packageDir({ name: "bare", version: "2.0.0", license: "MIT" });

    expect(readBundledPackage(dir)?.text).toBe("(The package ships no licence file.)");
  });

  it("skips a directory whose manifest names no package", () => {
    const dir = packageDir({ private: true });

    expect(readBundledPackage(dir)).toBeNull();
  });

  it("skips a directory without a manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "courier-notices-"));
    dirs.push(dir);
    mkdirSync(join(dir, "lib"));

    expect(readBundledPackage(dir)).toBeNull();
  });
});

describe("formatNotices", () => {
  it("lists every package by name, each with its licence text", () => {
    const text = formatNotices("The bundle", [
      { name: "zod", version: "4.0.0", license: "MIT", text: "MIT text" },
      {
        name: "@fontsource-variable/geist",
        version: "5.3.0",
        license: "OFL-1.1",
        text: "OFL text",
      },
    ]);

    expect(text.startsWith("The bundle carries the following packages")).toBe(true);
    expect(text.indexOf("@fontsource-variable/geist 5.3.0 — OFL-1.1")).toBeLessThan(
      text.indexOf("zod 4.0.0 — MIT"),
    );
    expect(text).toContain("OFL text");
    expect(text).toContain("MIT text");
  });
});
