import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readPathAliases } from "../src/runtime/path-aliases";

let root: string;

function write(relative: string, contents: string): string {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

function tsconfig(options: Record<string, unknown>, at = "tsconfig.json"): void {
  write(at, JSON.stringify(options));
}

/** A package installed in the project, so an alias can be seen to shadow one. */
function install(name: string): void {
  write(`node_modules/${name}/package.json`, JSON.stringify({ name, main: "index.js" }));
  write(`node_modules/${name}/index.js`, "module.exports = {};");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-aliases-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("readPathAliases", () => {
  it("is empty when the project has no tsconfig", () => {
    const aliases = readPathAliases(root);

    expect(aliases.loader).toEqual({});
    expect(aliases.candidatesFor("@/anything")).toEqual([]);
  });

  it("reads the tsconfig of the project a config below its root belongs to", () => {
    /* A config kept in deploy/ lost every alias of the project it lives in,
       and failed to load on its first aliased import. */
    tsconfig({ compilerOptions: { paths: { "@/*": ["./src/*"] } } });
    mkdirSync(join(root, "deploy"));

    expect(readPathAliases(join(root, "deploy")).candidatesFor("@/api")).toEqual([
      join(root, "src/api"),
    ]);
  });

  it("prefers the nearest tsconfig", () => {
    tsconfig({ compilerOptions: { paths: { "@/*": ["./src/*"] } } });
    tsconfig({ compilerOptions: { paths: { "@/*": ["./lib/*"] } } }, "deploy/tsconfig.json");

    expect(readPathAliases(join(root, "deploy")).candidatesFor("@/api")).toEqual([
      join(root, "deploy/lib/api"),
    ]);
  });

  it("is empty when the tsconfig declares no paths", () => {
    tsconfig({ compilerOptions: { strict: true } });

    expect(readPathAliases(root).loader).toEqual({});
  });

  it("resolves a wildcard mapping against the tsconfig's own directory", () => {
    tsconfig({ compilerOptions: { paths: { "@/*": ["./src/*"] } } });

    expect(readPathAliases(root).candidatesFor("@/lib/sources")).toEqual([
      join(root, "src/lib/sources"),
    ]);
  });

  /* Filled with String.replace, `$$` read as one `$`, `$&` as the `*` itself,
     and `` $` `` as the target before the `*`: the walker looked for a file
     the import never names. */
  it("fills the wildcard with the matched part as it is written, `$` and all", () => {
    tsconfig({ compilerOptions: { paths: { "@/*": ["./src/*"] } } });
    const aliases = readPathAliases(root);

    for (const name of ["lib/$$price", "lib/$&x", "a$`b", "a$'b", "$postId"]) {
      expect(aliases.candidatesFor(`@/${name}`)).toEqual([join(root, "src", name)]);
    }
  });

  /* Filled after the target was joined to the project's folder, the `*` of
     a folder named `star*proj` was filled in its stead. A name with a `*` is
     no file name on Windows. */
  it.skipIf(process.platform === "win32")(
    "fills the target's own wildcard, not one in the project folder's name",
    () => {
      const project = join(root, "star*proj");
      mkdirSync(project);
      writeFileSync(
        join(project, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
      );

      expect(readPathAliases(project).candidatesFor("@/lib/x")).toEqual([
        join(project, "src/lib/x"),
      ]);
    },
  );

  it("fills only the first wildcard of a target, as TypeScript does", () => {
    tsconfig({ compilerOptions: { paths: { "@/*": ["./src/*/*.ts", "./types.ts"] } } });

    expect(readPathAliases(root).candidatesFor("@/api")).toEqual([
      join(root, "src/api/*.ts"),
      join(root, "types.ts"),
    ]);
  });

  it("resolves a mapping that points outside the project", () => {
    tsconfig({ compilerOptions: { paths: { "@shared/*": ["../shared/*"] } } });

    expect(readPathAliases(root).candidatesFor("@shared/api")).toEqual([
      join(dirname(root), "shared/api"),
    ]);
  });

  it("resolves a mapping with no wildcard only on an exact specifier", () => {
    tsconfig({ compilerOptions: { paths: { "@config": ["./src/config.ts"] } } });
    const aliases = readPathAliases(root);

    expect(aliases.candidatesFor("@config")).toEqual([join(root, "src/config.ts")]);
    expect(aliases.candidatesFor("@config/nested")).toEqual([]);
  });

  it("offers every declared target in order", () => {
    tsconfig({ compilerOptions: { paths: { "@/*": ["./src/*", "./generated/*"] } } });

    expect(readPathAliases(root).candidatesFor("@/api")).toEqual([
      join(root, "src/api"),
      join(root, "generated/api"),
    ]);
  });

  it("honours baseUrl when the tsconfig sets one", () => {
    tsconfig({ compilerOptions: { baseUrl: "./app", paths: { "@/*": ["./src/*"] } } });

    expect(readPathAliases(root).candidatesFor("@/x")).toEqual([join(root, "app/src/x")]);
  });

  it("picks the mapping with the longest prefix when several match", () => {
    tsconfig({
      compilerOptions: { paths: { "@/*": ["./src/*"], "@/deep/*": ["./elsewhere/*"] } },
    });

    expect(readPathAliases(root).candidatesFor("@/deep/thing")).toEqual([
      join(root, "elsewhere/thing"),
    ]);
  });

  it("matches a pattern whose wildcard is not at the end", () => {
    tsconfig({ compilerOptions: { paths: { "~/*/api": ["./src/*/api.ts"] } } });

    expect(readPathAliases(root).candidatesFor("~/users/api")).toEqual([
      join(root, "src/users/api.ts"),
    ]);
  });

  it("ignores an alias that shadows an installed package", () => {
    install("some-lib");
    tsconfig({ compilerOptions: { paths: { "some-lib": ["../some-lib/src/index.ts"] } } });
    const aliases = readPathAliases(root);

    expect(aliases.candidatesFor("some-lib")).toEqual([]);
    expect(aliases.loader).toEqual({});
  });

  it("ignores a subpath alias of an installed package but keeps the project's own", () => {
    install("some-lib");
    tsconfig({
      compilerOptions: {
        paths: { "some-lib/*": ["../some-lib/src/*"], "@/*": ["./src/*"] },
      },
    });
    const aliases = readPathAliases(root);

    expect(aliases.candidatesFor("some-lib/thing")).toEqual([]);
    expect(aliases.candidatesFor("@/thing")).toEqual([join(root, "src/thing")]);
  });

  it("takes an installed package of an aliased scope past the alias, and the rest through it", () => {
    /* The alias for a whole scope was followed for every name in it, so a
       package installed from the scope loaded the project's file instead. */
    install("@acme/ui");
    write("src/ui.ts", "");
    write("src/utils/index.ts", "");
    tsconfig({ compilerOptions: { paths: { "@acme/*": ["./src/*"] } } });
    const aliases = readPathAliases(root);

    expect(aliases.candidatesFor("@acme/ui")).toEqual([]);
    expect(aliases.candidatesFor("@acme/ui/button")).toEqual([]);
    expect(aliases.candidatesFor("@acme/utils")).toEqual([join(root, "src/utils")]);
    expect(aliases.loader).toEqual({ "@acme/utils": join(root, "src/utils") });
  });

  it("gives the loader every name of an aliased scope when the project installed none of them", () => {
    write("src/ui.tsx", "");
    write("src/types.d.ts", "");
    tsconfig({ compilerOptions: { paths: { "@acme/*": ["./src/*"] } } });

    expect(readPathAliases(root).loader).toEqual({
      "@acme/types": join(root, "src/types"),
      "@acme/ui": join(root, "src/ui"),
    });
  });

  it("leaves out a catch-all alias, which the loader would put before every path", () => {
    /* `"*": ["./types/*"]` reached the loader as an alias for the empty
       prefix, and no config of such a project loaded: every path, the
       config's own included, was looked up under types/. */
    install("some-lib");
    tsconfig({ compilerOptions: { paths: { "*": ["./types/*"], "@/*": ["./src/*"] } } });
    const aliases = readPathAliases(root);

    expect(aliases.loader).toEqual({ "@/": join(root, "src/") });
    expect(aliases.candidatesFor("some-lib")).toEqual([]);
    expect(aliases.candidatesFor("@/thing")).toEqual([join(root, "src/thing")]);
  });

  it("reads paths from the tsconfig it extends", () => {
    tsconfig({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }, "base/tsconfig.json");
    tsconfig({ extends: "./base/tsconfig.json", compilerOptions: { strict: true } });

    expect(readPathAliases(root).candidatesFor("@/x")).toEqual([join(root, "base/src/x")]);
  });

  it("prefers its own paths over the ones it extends", () => {
    tsconfig({ compilerOptions: { paths: { "@/*": ["./base/*"] } } }, "base/tsconfig.json");
    tsconfig({
      extends: "./base/tsconfig.json",
      compilerOptions: { paths: { "@/*": ["./own/*"] } },
    });

    expect(readPathAliases(root).candidatesFor("@/x")).toEqual([join(root, "own/x")]);
  });

  it("takes the last entry of an extends array that declares paths", () => {
    tsconfig({ compilerOptions: { paths: { "@/*": ["./first/*"] } } }, "a/tsconfig.json");
    tsconfig({ compilerOptions: { paths: { "@/*": ["./second/*"] } } }, "b/tsconfig.json");
    tsconfig({ extends: ["./a/tsconfig.json", "./b/tsconfig.json"] });

    expect(readPathAliases(root).candidatesFor("@/x")).toEqual([join(root, "b/second/x")]);
  });

  it("survives a tsconfig that extends itself", () => {
    tsconfig({ extends: "./tsconfig.json", compilerOptions: {} });

    expect(() => readPathAliases(root)).not.toThrow();
    expect(readPathAliases(root).loader).toEqual({});
  });

  it("ignores a mapping whose targets are not a list of paths, and keeps the others", () => {
    tsconfig({ compilerOptions: { paths: { "@/*": "./src/*", "~/*": ["./lib/*"] } } });

    const aliases = readPathAliases(root);

    expect(aliases.candidatesFor("@/x")).toEqual([]);
    expect(aliases.candidatesFor("~/x")).toEqual([join(root, "lib/x")]);
  });

  it("follows no extends that is not a path, and survives it", () => {
    tsconfig({ extends: 5 });

    expect(() => readPathAliases(root)).not.toThrow();
    expect(readPathAliases(root).loader).toEqual({});
  });

  it.skipIf(process.platform === "win32")(
    "is not held up by a pipe where its tsconfig should be",
    () => {
      const fifo = join(root, "tsconfig.json");
      execFileSync("mkfifo", [fifo]);
      /* A writer that would let a read of the pipe finish after a while. */
      const writer = spawn("sh", ["-c", `sleep 2; echo '{}' > '${fifo}'`], { stdio: "ignore" });
      try {
        const started = Date.now();
        const aliases = readPathAliases(root);

        expect(Date.now() - started).toBeLessThan(1000);
        expect(aliases.loader).toEqual({});
      } finally {
        writer.kill();
      }
    },
  );

  it("reads a tsconfig containing comments and trailing commas", () => {
    write(
      "tsconfig.json",
      `{
         // the project's own modules
         "compilerOptions": { "paths": { "@/*": ["./src/*"], }, },
       }`,
    );

    expect(readPathAliases(root).candidatesFor("@/x")).toEqual([join(root, "src/x")]);
  });

  it("gives the loader a prefix map with absolute targets", () => {
    tsconfig({
      compilerOptions: { paths: { "@/*": ["./src/*"], "@config": ["./config.ts"] } },
    });

    expect(readPathAliases(root).loader).toEqual({
      "@/": `${join(root, "src")}${sep}`,
      "@config": join(root, "config.ts"),
    });
  });

  it("leaves a mapping the loader cannot express out of its map", () => {
    tsconfig({ compilerOptions: { paths: { "~/*/api": ["./src/*/api.ts"] } } });
    const aliases = readPathAliases(root);

    expect(aliases.loader).toEqual({});
    expect(aliases.candidatesFor("~/users/api")).toEqual([join(root, "src/users/api.ts")]);
  });
});
