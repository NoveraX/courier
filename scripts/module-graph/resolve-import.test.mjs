/**
 * Where an import of a published module leads for a page's bundler: the
 * condition of a package's `imports` or `exports` a page sets, in the
 * entry's own order — a package of the workspace named by its name, its
 * own among them, through its exports — and nothing past a target that is
 * not there.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { packageOf, pageTarget, resolveImport, underLib } from "./resolve-import.mjs";

describe("pageTarget", () => {
  it("takes the first condition a page's bundler sets, in the entry's order", () => {
    const entry = {
      "edge-light": "./lib/*",
      workerd: "./lib/*",
      "react-native": "./lib/*",
      browser: "./lib/browser/*",
      default: "./lib/*",
    };

    expect(pageTarget(entry)).toBe("./lib/browser/*");
  });

  it("falls back to the default, and to nothing where no condition applies", () => {
    expect(pageTarget({ node: "./lib/node.js", default: "./lib/any.js" })).toBe("./lib/any.js");
    expect(pageTarget({ node: "./lib/node.js" })).toBeUndefined();
  });
});

describe("resolveImport", () => {
  const pkg = {
    name: "@noverax/courier",
    root: "/nowhere",
    exports: {},
    imports: { "#courier-server/*": { node: "./lib/*" } },
  };
  const packages = [pkg];

  it("tells a built-in module of Node by either spelling", () => {
    expect(resolveImport("node:fs", "/nowhere/lib/a.js", packages)).toEqual({
      kind: "builtin",
      name: "node:fs",
    });
    expect(resolveImport("fs/promises", "/nowhere/lib/a.js", packages)).toEqual({
      kind: "builtin",
      name: "fs/promises",
    });
  });

  it("leaves a package outside the workspace to itself", () => {
    expect(resolveImport("@standard-schema/spec", "/nowhere/lib/a.js", packages)).toEqual({
      kind: "package",
      name: "@standard-schema/spec",
    });
  });

  it("names what is missing: a file, a target for a page, an entry of the imports or the exports", () => {
    expect(resolveImport("./b.js", "/nowhere/lib/a.js", packages).kind).toBe("missing");
    expect(resolveImport("#courier-server/x.js", "/nowhere/lib/a.js", packages)).toEqual({
      kind: "missing",
      reason: "#courier-server/x.js has no target for a page",
    });
    expect(resolveImport("#other/x.js", "/nowhere/lib/a.js", packages)).toEqual({
      kind: "missing",
      reason: "#other/x.js is not in the package's imports",
    });
    expect(resolveImport("@noverax/courier/server", "/nowhere/lib/a.js", packages)).toEqual({
      kind: "missing",
      reason: "@noverax/courier/server is not in the exports of @noverax/courier",
    });
  });
});

describe("resolveImport of a workspace package by its name", () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "courier-resolve-"));
    for (const path of ["core/lib/server/index.js", "core/lib/index.js", "react/lib/index.js"]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "export {};");
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function workspace() {
    return [
      {
        name: "@noverax/courier",
        root: join(root, "core"),
        exports: {
          ".": { types: "./lib/index.d.ts", import: "./lib/index.js" },
          "./server": { types: "./lib/server/index.d.ts", import: "./lib/server/index.js" },
        },
        imports: {},
      },
      {
        name: "@noverax/courier-react",
        root: join(root, "react"),
        exports: "./lib/index.js",
        imports: {},
      },
    ];
  }

  it("follows a package's own name and subpath through its exports, as a page's conditions pick", () => {
    const importer = join(root, "core/lib/client/proxy.js");

    expect(resolveImport("@noverax/courier/server", importer, workspace())).toEqual({
      kind: "module",
      path: join(root, "core/lib/server/index.js"),
    });
    expect(resolveImport("@noverax/courier", importer, workspace())).toEqual({
      kind: "module",
      path: join(root, "core/lib/index.js"),
    });
  });

  it("follows another package of the workspace, whose exports name its root alone", () => {
    expect(
      resolveImport("@noverax/courier-react", join(root, "core/lib/a.js"), workspace()),
    ).toEqual({
      kind: "module",
      path: join(root, "react/lib/index.js"),
    });
  });

  it("finds the package a module lies in", () => {
    expect(packageOf(join(root, "react/lib/index.js"), workspace())?.name).toBe(
      "@noverax/courier-react",
    );
    expect(packageOf(join(root, "elsewhere.js"), workspace())).toBeUndefined();
  });
});

describe("underLib", () => {
  it("names a module by its path under lib, with forward slashes", () => {
    expect(underLib("/pkg/lib", "/pkg/lib/adapter/limits.js")).toBe("adapter/limits.js");
  });
});
