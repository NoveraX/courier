import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readPathAliases } from "@noverax/courier-studio-core/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTsconfigInputs } from "../src/server/read-tsconfig-inputs";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-tsconfig-inputs-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function file(rel: string, content: unknown): string {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, typeof content === "string" ? content : JSON.stringify(content));
  return abs;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const PATHS = { compilerOptions: { paths: { "@/*": ["./src/*"] } } };

describe("readTsconfigInputs", () => {
  it("records the tsconfig beside the directory with the hash of its bytes", () => {
    const tsconfig = file("tsconfig.json", PATHS);

    expect([...readTsconfigInputs(dir)]).toEqual([[tsconfig, sha256(tsconfig)]]);
  });

  it("records each nearer tsconfig.json absent when the nearest is above the directory", () => {
    const tsconfig = file("tsconfig.json", PATHS);
    mkdirSync(join(dir, "packages", "app"), { recursive: true });

    const inputs = readTsconfigInputs(join(dir, "packages", "app"));

    expect([...inputs]).toEqual([
      [join(dir, "packages", "app", "tsconfig.json"), null],
      [join(dir, "packages", "tsconfig.json"), null],
      [tsconfig, sha256(tsconfig)],
    ]);
  });

  it("records only the directory's own tsconfig.json absent when none is found", () => {
    const inputs = readTsconfigInputs(dir);

    /* The temporary directory's ancestors hold no tsconfig.json either. */
    expect([...inputs]).toEqual([[join(dir, "tsconfig.json"), null]]);
  });

  it("follows extends until a tsconfig declares paths, and no further", () => {
    const tsconfig = file("tsconfig.json", { extends: "./tsconfig.paths.json" });
    const declaring = file("tsconfig.paths.json", { extends: "./tsconfig.base.json", ...PATHS });
    file("tsconfig.base.json", { compilerOptions: { strict: true } });

    expect([...readTsconfigInputs(dir)]).toEqual([
      [tsconfig, sha256(tsconfig)],
      [declaring, sha256(declaring)],
    ]);
  });

  it("leaves out only files the alias reader's answer does not depend on", () => {
    file("tsconfig.json", { extends: "./tsconfig.paths.json" });
    file("tsconfig.paths.json", { extends: "./tsconfig.base.json", ...PATHS });
    const beyond = file("tsconfig.base.json", { compilerOptions: { strict: true } });
    const answer = () => readPathAliases(dir).candidatesFor("@/x");
    const before = answer();

    file("tsconfig.base.json", { compilerOptions: { paths: { "@/*": ["./other/*"] } } });
    const afterBeyond = answer();
    file("tsconfig.paths.json", { compilerOptions: { paths: { "@/*": ["./other/*"] } } });

    expect(readTsconfigInputs(dir).has(beyond)).toBe(false);
    expect(afterBeyond).toEqual(before);
    expect(answer()).toEqual([join(dir, "other", "x")]);
  });

  it("follows the last entry of an extends array first, as it overrides the others", () => {
    const tsconfig = file("tsconfig.json", { extends: ["./a.json", "./b.json"] });
    const b = file("b.json", { compilerOptions: { strict: true } });
    const a = file("a.json", PATHS);

    expect([...readTsconfigInputs(dir).keys()]).toEqual([tsconfig, b, a]);
  });

  it("stops at the first extends entry that declares paths", () => {
    const tsconfig = file("tsconfig.json", { extends: ["./a.json", "./b.json"] });
    file("a.json", PATHS);
    const b = file("b.json", PATHS);

    expect([...readTsconfigInputs(dir).keys()]).toEqual([tsconfig, b]);
  });

  it("reads a directory's tsconfig.json, and a path given without .json", () => {
    const tsconfig = file("tsconfig.json", { extends: ["./shared", "./tsconfig.base"] });
    const base = file("tsconfig.base.json", { compilerOptions: {} });
    const shared = file("shared/tsconfig.json", PATHS);

    expect([...readTsconfigInputs(dir)]).toEqual([
      [tsconfig, sha256(tsconfig)],
      [join(dir, "tsconfig.base"), null],
      [base, sha256(base)],
      [shared, sha256(shared)],
    ]);
  });

  it("records where a missing extends target would be created", () => {
    const tsconfig = file("tsconfig.json", { extends: ["../configs/base.json", "./tsconfig.base"] });

    expect([...readTsconfigInputs(dir)]).toEqual([
      [tsconfig, sha256(tsconfig)],
      [join(dir, "tsconfig.base"), null],
      [join(dir, "tsconfig.base.json"), null],
      [join(dirname(dir), "configs"), null],
    ]);
  });

  it("follows a tsconfig an installed package ships", () => {
    const tsconfig = file("tsconfig.json", { extends: "@acme/tsconfig" });
    file("node_modules/@acme/tsconfig/package.json", { name: "@acme/tsconfig" });
    const shipped = file("node_modules/@acme/tsconfig/tsconfig.json", PATHS);

    expect([...readTsconfigInputs(dir)]).toEqual([
      [tsconfig, sha256(tsconfig)],
      [shipped, sha256(shipped)],
    ]);
  });

  it("records a tsconfig that does not parse, without following it", () => {
    const tsconfig = file("tsconfig.json", '{ "extends": "./tsconfig.base.json",');
    file("tsconfig.base.json", PATHS);

    expect([...readTsconfigInputs(dir)]).toEqual([[tsconfig, sha256(tsconfig)]]);
  });

  it("reads each file of an extends cycle once", () => {
    const tsconfig = file("tsconfig.json", { extends: "./a.json" });
    const a = file("a.json", { extends: "./tsconfig.json" });

    expect([...readTsconfigInputs(dir).keys()]).toEqual([tsconfig, a]);
  });
});

/** What the alias reader answers for `@/x` in `directory`, or what it throws there. */
function aliasAnswer(directory: string): string {
  try {
    return JSON.stringify(readPathAliases(directory).candidatesFor("@/x"));
  } catch (error) {
    return `throws ${String(error)}`;
  }
}

const PROBE = { compilerOptions: { paths: { "@/*": ["./probe/*"] } } };
const STRICT = { compilerOptions: { strict: true } };

/**
 * The files recorded are the ones the alias reader's answer depends on, and
 * no others: for each probe, a file written there with paths of its own
 * changes what the reader answers exactly when the probe is recorded.
 */
describe("readTsconfigInputs — the files the alias reader depends on", () => {
  const layouts: ReadonlyArray<[string, Record<string, unknown>, string, string[]]> = [
    ["a tsconfig that declares paths", { "tsconfig.json": PATHS }, ".", ["tsconfig.json", "tsconfig.base.json"]],
    [
      "an extends chain",
      {
        "tsconfig.json": { extends: "./tsconfig.paths.json" },
        "tsconfig.paths.json": { extends: "./tsconfig.base.json", ...PATHS },
        "tsconfig.base.json": STRICT,
      },
      ".",
      ["tsconfig.json", "tsconfig.paths.json", "tsconfig.base.json"],
    ],
    [
      "an extends array",
      { "tsconfig.json": { extends: ["./a.json", "./b.json"] }, "a.json": PATHS, "b.json": STRICT },
      ".",
      ["tsconfig.json", "a.json", "b.json"],
    ],
    [
      "an extends array whose last entry declares paths",
      { "tsconfig.json": { extends: ["./a.json", "./b.json"] }, "a.json": PATHS, "b.json": PATHS },
      ".",
      ["tsconfig.json", "a.json", "b.json"],
    ],
    [
      "an extends given without .json",
      { "tsconfig.json": { extends: "./tsconfig.base" }, "tsconfig.base.json": PATHS },
      ".",
      ["tsconfig.json", "tsconfig.base", "tsconfig.base.json"],
    ],
    [
      "an extends that names a directory",
      { "tsconfig.json": { extends: "./shared" }, "shared/tsconfig.json": PATHS },
      ".",
      ["tsconfig.json", "shared/tsconfig.json"],
    ],
    [
      "a tsconfig above the directory",
      { "tsconfig.json": { compilerOptions: { paths: { "@/*": ["./app/src/*"] } } }, "app/courier.config.ts": "" },
      "app",
      ["tsconfig.json", "app/tsconfig.json"],
    ],
    [
      "a tsconfig a package ships",
      {
        "tsconfig.json": { extends: "@acme/tsconfig" },
        "node_modules/@acme/tsconfig/package.json": { name: "@acme/tsconfig" },
        "node_modules/@acme/tsconfig/tsconfig.json": PATHS,
      },
      ".",
      ["tsconfig.json", "node_modules/@acme/tsconfig/tsconfig.json"],
    ],
    ...(
      [
        ["paths set to null", null],
        ["paths set to an empty array", []],
        ["paths set to a string", "./src/*"],
        ["paths set to zero", 0],
        ["a paths entry that is no array", { "@/*": "./src/*" }],
      ] as const
    ).map(([name, paths]): [string, Record<string, unknown>, string, string[]] => [
      name,
      { "tsconfig.json": { extends: "./base.json", compilerOptions: { paths } }, "base.json": PATHS },
      ".",
      ["tsconfig.json", "base.json"],
    ]),
    [
      "an extends entry that is no string, followed last",
      { "tsconfig.json": { extends: [1, "./b.json"] }, "b.json": PATHS },
      ".",
      ["tsconfig.json", "b.json"],
    ],
    [
      "an extends entry that is no string, followed first",
      { "tsconfig.json": { extends: ["./b.json", 1] }, "b.json": STRICT },
      ".",
      ["tsconfig.json", "b.json"],
    ],
    [
      "an extends that is neither a string nor an array",
      { "tsconfig.json": { extends: { path: "./b.json" } }, "b.json": STRICT },
      ".",
      ["tsconfig.json", "b.json"],
    ],
    [
      "a tsconfig that does not parse",
      { "tsconfig.json": '{ "extends": "./base.json",', "base.json": PATHS },
      ".",
      ["tsconfig.json", "base.json"],
    ],
    [
      "an extends cycle",
      { "tsconfig.json": { extends: "./a.json" }, "a.json": { extends: "./tsconfig.json" } },
      ".",
      ["tsconfig.json", "a.json"],
    ],
  ];

  it.each(layouts)("records what the answer depends on for %s", (_name, layout, from, probes) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [rel, content] of Object.entries(layout)) file(rel, content);
    const directory = join(dir, from);
    const recorded = readTsconfigInputs(directory);
    const before = aliasAnswer(directory);

    const outcomes = probes.map((rel) => {
      const probe = join(dir, rel);
      const original = existsSync(probe) ? readFileSync(probe) : null;
      file(rel, PROBE);
      const changed = aliasAnswer(directory) !== before;
      if (original === null) unlinkSync(probe);
      else writeFileSync(probe, original);
      return { probe: rel, recorded: recorded.has(probe), changed };
    });

    expect(outcomes.map(({ probe, recorded: isRecorded }) => [probe, isRecorded])).toEqual(
      outcomes.map(({ probe, changed }) => [probe, changed]),
    );
  });
});
