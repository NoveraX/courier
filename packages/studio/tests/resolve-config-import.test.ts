import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { errnoCode } from "@noverax/courier-cli/devkit";
import { createConfigJiti, readPathAliases } from "@noverax/courier-studio-core/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfigImport } from "../src/server/resolve-config-import";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-resolve-import-")));
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function files(...paths: string[]): void {
  for (const path of paths) {
    const abs = join(dir, path);
    mkdirSync(dirname(abs), { recursive: true });
    const body = path.endsWith("package.json")
      ? '{ "main": "lib.js" }'
      : path.endsWith(".json")
        ? "{}"
        : "export const x = 1;\n";
    writeFileSync(abs, body);
  }
}

/** What the module loader Studio evaluates the config with makes of `specifier`. */
async function loaderResolves(specifier: string): Promise<string | null> {
  const config = join(dir, "courier.config.ts");
  const jiti = await createConfigJiti(config);
  let resolved: string;
  try {
    resolved = jiti.esmResolve(specifier, { parentURL: pathToFileURL(config).href });
  } catch (error) {
    if (errnoCode(error) === "MODULE_NOT_FOUND") return null;
    throw error;
  }
  return realpathSync(resolved.startsWith("file:") ? fileURLToPath(resolved) : resolved);
}

function walkResolves(specifier: string): string | null {
  return resolveConfigImport(dir, specifier, readPathAliases(dir)).file;
}

function absentBefore(specifier: string): string[] {
  return resolveConfigImport(dir, specifier, readPathAliases(dir)).absent;
}

/** The path itself, then each extension the module loader tries, in its order. */
const EXTENSIONS = ["", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx"];

/**
 * The dependency walk must name the file the loader evaluates, or the watch
 * follows a file that does not run. Each layout is resolved by both.
 */
describe("resolveConfigImport — the file the module loader takes", () => {
  const layouts: ReadonlyArray<[string, string[], string, string | null]> = [
    ["a compiled .js beside the .ts", ["x.js", "x.ts"], "./x", "x.js"],
    ["an .mjs beside the .ts", ["x.mjs", "x.ts"], "./x", "x.mjs"],
    ["a .cjs beside the .ts", ["x.cjs", "x.ts"], "./x", "x.cjs"],
    ["a .tsx beside the .mts", ["x.tsx", "x.mts"], "./x", "x.tsx"],
    ["an extensionless file beside the .js", ["x", "x.js"], "./x", "x"],
    ["a file before a directory's index", ["x/index.js", "x.ts"], "./x", "x.ts"],
    [
      "a directory's index.js beside its index.ts",
      ["x/index.ts", "x/index.js"],
      "./x",
      join("x", "index.js"),
    ],
    ["the .ts a NodeNext .js import stands for", ["x.ts"], "./x.js", "x.ts"],
    ["the .mts an .mjs import stands for", ["x.mts"], "./x.mjs", "x.mts"],
    ["the .cts a .cjs import stands for", ["x.cts"], "./x.cjs", "x.cts"],
    ["the .tsx a .jsx import stands for", ["x.tsx"], "./x.jsx", "x.tsx"],
    ["a .js.ts before the .ts a .js import stands for", ["x.js.ts", "x.ts"], "./x.js", "x.js.ts"],
    ["a .json Node finds", ["x.json"], "./x", "x.json"],
    ["a directory's package.json main", ["x/package.json", "x/lib.js"], "./x", join("x", "lib.js")],
    [
      "a .json Node finds before the .ts a .js import stands for",
      ["x.js.json", "x.ts"],
      "./x.js",
      "x.js.json",
    ],
    [
      "a compiled .js beside the .ts behind an alias",
      ["src/x.js", "src/x.ts"],
      "@/x",
      join("src", "x.js"),
    ],
    [
      "the .ts a NodeNext .js import stands for behind an alias",
      ["src/x.ts"],
      "@/x.js",
      join("src", "x.ts"),
    ],
    ["nothing for a .jsx the import leaves unnamed", ["x.jsx"], "./x", null],
    ["nothing for a .tsx a .js import does not stand for", ["x.tsx"], "./x.js", null],
  ];

  it.each(layouts)("takes %s", async (_name, present, specifier, expected) => {
    files(...present);

    const walked = walkResolves(specifier);

    expect(walked).toBe(expected === null ? null : join(dir, expected));
    expect(walked).toBe(await loaderResolves(specifier));
  });

  it("takes no directory named like a candidate, as the loader takes none", async () => {
    mkdirSync(join(dir, "x.ts"));
    files("x.mts");

    expect(walkResolves("./x")).toBe(join(dir, "x.mts"));
    expect(await loaderResolves("./x")).toBe(join(dir, "x.mts"));
  });

  it.skipIf(process.platform === "win32")(
    "takes no FIFO named like a candidate, as the loader takes only a regular file there",
    async () => {
      execFileSync("mkfifo", [join(dir, "x.js")]);
      files("x.ts");

      expect(walkResolves("./x")).toBe(join(dir, "x.ts"));
      expect(await loaderResolves("./x")).toBe(join(dir, "x.ts"));
    },
  );

  const fifoLayouts: ReadonlyArray<[string, string, string[], string, string]> = [
    ["a FIFO where no regular file is named", "x.ts", [], "./x", "x.ts"],
    [
      "a FIFO index file where no regular file is named",
      join("x", "index.ts"),
      [],
      "./x",
      join("x", "index.ts"),
    ],
    ["a FIFO at the TypeScript file a .js import stands for", "x.ts", [], "./x.js", "x.ts"],
    [
      "a FIFO asked of Node before the TypeScript file a .js import stands for",
      "x.js.mjs",
      ["x.ts"],
      "./x.js",
      "x.js.mjs",
    ],
    ["a regular file named after a FIFO", "x.ts", ["x.mts"], "./x", "x.mts"],
  ];

  it.skipIf(process.platform === "win32").each(fifoLayouts)(
    "takes %s, as Node's resolution does once no regular file is",
    async (_name, fifo, present, specifier, expected) => {
      mkdirSync(dirname(join(dir, fifo)), { recursive: true });
      execFileSync("mkfifo", [join(dir, fifo)]);
      files(...present);

      expect(walkResolves(specifier)).toBe(join(dir, expected));
      expect(await loaderResolves(specifier)).toBe(join(dir, expected));
    },
  );
});

/**
 * A module created at a path the loader tries first is the one the next load
 * runs, so each such path is named, whether the import names a file yet or not.
 */
describe("resolveConfigImport — the absent paths the loader tries first", () => {
  it("names the absent paths tried before the file it takes", () => {
    files("x.ts");

    expect(absentBefore("./x")).toEqual(
      ["", ".js", ".mjs", ".cjs"].map((extension) => join(dir, `x${extension}`)),
    );
  });

  it("names none when the first path tried is the file it takes", () => {
    files("x.ts");

    expect(absentBefore("./x.ts")).toEqual([]);
  });

  it("names every path tried before the TypeScript file a .js import stands for", () => {
    files("x.ts");

    const absent = absentBefore("./x.js");

    expect(absent).toEqual(EXTENSIONS.map((extension) => join(dir, `x.js${extension}`)));
  });

  it("names the paths a relative import spells with each extension the resolution tries", () => {
    mkdirSync(join(dir, "src"));

    expect(absentBefore("./src/late")).toEqual(
      EXTENSIONS.map((extension) => join(dir, "src", `late${extension}`)),
    );
  });

  it("names the first missing directory of an import into a directory that does not exist", () => {
    const absent = absentBefore("./generated/client/api");

    expect(absent).toEqual([join(dir, "generated")]);
    for (const path of absent) expect(existsSync(dirname(path))).toBe(true);
  });

  it("names the index files of an existing directory that holds none", () => {
    mkdirSync(join(dir, "api"));

    expect(absentBefore("./api")).toEqual([
      ...EXTENSIONS.slice(1).map((extension) => join(dir, `api${extension}`)),
      ...EXTENSIONS.slice(1).map((extension) => join(dir, "api", `index${extension}`)),
    ]);
  });

  it("names the paths an aliased import could be created at", () => {
    mkdirSync(join(dir, "src"));

    expect(absentBefore("@/late")).toEqual(
      EXTENSIONS.map((extension) => join(dir, "src", `late${extension}`)),
    );
  });

  it("names the TypeScript file a JavaScript extension stands for, last", () => {
    mkdirSync(join(dir, "src"));

    const absent = absentBefore("./src/late.js");

    expect(absent.at(-1)).toBe(join(dir, "src", "late.ts"));
    expect(absent).toContain(join(dir, "src", "late.js"));
    expect(absentBefore("./src/late.mjs")).toContain(join(dir, "src", "late.mts"));
  });

  it("names nothing for a package or a node builtin", () => {
    expect(absentBefore("@noverax/courier/config")).toEqual([]);
    expect(absentBefore("node:fs")).toEqual([]);
  });

  it("leaves out a candidate that exists but is no file the resolution takes", () => {
    mkdirSync(join(dir, "src", "late.ts"), { recursive: true });

    const absent = absentBefore("./src/late");

    expect(absent).not.toContain(join(dir, "src", "late.ts"));
    expect(absent).toContain(join(dir, "src", "late.tsx"));
  });
});
