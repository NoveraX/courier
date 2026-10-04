/**
 * Whether TypeScript may resolve a directory's imports as Node does, read
 * from the nearest tsconfig.json, the configs it extends and the projects it
 * references, without TypeScript.
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usesNodeResolution } from "../../src/server/mocks-edit/uses-node-resolution";

let root: string;

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-node-resolution-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
});

function write(relative: string, text: string): void {
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function tsconfig(compilerOptions: Record<string, string>, relative = "tsconfig.json"): void {
  write(relative, JSON.stringify({ compilerOptions }));
}

describe("usesNodeResolution", () => {
  it.each([["NodeNext"], ["nodenext"], ["Node16"], ["node18"], ["node20"]])(
    "takes a module of %s, with no moduleResolution, for Node's resolution",
    (module) => {
      tsconfig({ module });

      expect(usesNodeResolution(root)).toBe(true);
    },
  );

  it.each([["NodeNext"], ["node16"]])(
    "takes a moduleResolution of %s for Node's resolution",
    (moduleResolution) => {
      tsconfig({ module: "NodeNext", moduleResolution });

      expect(usesNodeResolution(root)).toBe(true);
    },
  );

  it.each([
    [{ module: "ESNext", moduleResolution: "bundler" }],
    [{ module: "preserve" }],
    [{ module: "CommonJS" }],
    [{ module: "ESNext" }],
    [{ moduleResolution: "node10" }],
    [{}],
  ])("takes %o for another resolution", (options) => {
    tsconfig(options);

    expect(usesNodeResolution(root)).toBe(false);
  });

  it("finds no resolution where no tsconfig.json is at or above the directory", () => {
    expect(usesNodeResolution(root)).toBe(false);
  });

  it("reads the nearest tsconfig.json above the directory", () => {
    tsconfig({ module: "NodeNext" });
    mkdirSync(join(root, "packages", "app"), { recursive: true });

    expect(usesNodeResolution(join(root, "packages", "app"))).toBe(true);
  });

  it("reads a tsconfig with comments and trailing commas", () => {
    write(
      "tsconfig.json",
      '{\n  // Node\'s own resolution\n  "compilerOptions": { "module": "NodeNext", },\n}\n',
    );

    expect(usesNodeResolution(root)).toBe(true);
  });

  it("takes the options of the config a tsconfig extends", () => {
    tsconfig({ module: "NodeNext" }, "configs/base.json");
    write(
      "tsconfig.json",
      JSON.stringify({ extends: "./configs/base.json", compilerOptions: { strict: "true" } }),
    );

    expect(usesNodeResolution(root)).toBe(true);
  });

  it("takes a moduleResolution from one extended config over a module from another", () => {
    tsconfig({ module: "NodeNext" }, "node.json");
    write(
      "tsconfig.json",
      JSON.stringify({
        extends: ["./node.json"],
        compilerOptions: { moduleResolution: "nodenext" },
      }),
    );

    expect(usesNodeResolution(root)).toBe(true);
  });

  it("takes Node's resolution from a base that a later entry of an extends array brings again", () => {
    tsconfig({ module: "NodeNext", moduleResolution: "NodeNext" }, "base.json");
    write(
      "bundler.json",
      JSON.stringify({
        extends: "./base.json",
        compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
      }),
    );
    write("strict.json", JSON.stringify({ extends: "./base.json" }));
    write("tsconfig.json", JSON.stringify({ extends: ["./bundler.json", "./strict.json"] }));

    expect(usesNodeResolution(root)).toBe(true);
  });

  it("takes a tsconfig that does not parse for one that sets nothing, and says so at debug level", () => {
    write("tsconfig.json", '{ "compilerOptions": { "module": "NodeNext" ');
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");

    expect(usesNodeResolution(root)).toBe(false);
    expect(console.debug).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(
        `Could not read ${join(root, "tsconfig.json")}, so the module options it sets are not known`,
      ),
      expect.any(SyntaxError),
    );
  });
});

describe("usesNodeResolution with project references", () => {
  function solution(...paths: string[]): void {
    write(
      "tsconfig.json",
      JSON.stringify({ files: [], references: paths.map((path) => ({ path })) }),
    );
  }

  it("takes Node's resolution from a project a solution tsconfig references", () => {
    solution("./tsconfig.node.json");
    write(
      "tsconfig.node.json",
      JSON.stringify({ compilerOptions: { module: "NodeNext" }, include: ["*.ts"] }),
    );

    expect(usesNodeResolution(root)).toBe(true);
  });

  it("takes it from any one of the referenced projects", () => {
    solution("./tsconfig.app.json", "./tsconfig.node.json");
    tsconfig({ module: "ESNext", moduleResolution: "bundler" }, "tsconfig.app.json");
    tsconfig({ module: "NodeNext", moduleResolution: "NodeNext" }, "tsconfig.node.json");

    expect(usesNodeResolution(root)).toBe(true);
  });

  it("finds no Node resolution where no referenced project has it", () => {
    solution("./tsconfig.app.json", "./tsconfig.node.json");
    tsconfig({ module: "ESNext", moduleResolution: "bundler" }, "tsconfig.app.json");
    tsconfig({ module: "preserve" }, "tsconfig.node.json");

    expect(usesNodeResolution(root)).toBe(false);
  });

  it("reads a reference to a directory as its tsconfig.json", () => {
    solution("./server");
    tsconfig({ module: "node16" }, "server/tsconfig.json");

    expect(usesNodeResolution(root)).toBe(true);
  });

  it("takes the options a referenced project extends", () => {
    solution("./tsconfig.node.json");
    tsconfig({ module: "NodeNext" }, "configs/node.json");
    write("tsconfig.node.json", JSON.stringify({ extends: "./configs/node.json" }));

    expect(usesNodeResolution(root)).toBe(true);
  });

  it("follows the references of a referenced solution", () => {
    solution("./packages");
    write(
      "packages/tsconfig.json",
      JSON.stringify({ files: [], references: [{ path: "./server/tsconfig.build.json" }] }),
    );
    tsconfig({ module: "NodeNext" }, "packages/server/tsconfig.build.json");

    expect(usesNodeResolution(root)).toBe(true);
  });

  it("ends references that come back to a project already read", () => {
    solution("./a.json");
    write(
      "a.json",
      JSON.stringify({
        files: [],
        references: [{ path: "./tsconfig.json" }, { path: "./a.json" }],
      }),
    );

    expect(usesNodeResolution(root)).toBe(false);
  });

  it("skips a reference it cannot read and an entry without a path, reading the others", () => {
    write(
      "tsconfig.json",
      JSON.stringify({
        files: [],
        references: [
          { path: "./missing.json" },
          { prepend: true },
          "./x.json",
          { path: "./tsconfig.node.json" },
        ],
      }),
    );
    tsconfig({ module: "NodeNext" }, "tsconfig.node.json");

    expect(usesNodeResolution(root)).toBe(true);
  });

  it("does not take references from a config the tsconfig extends, as TypeScript does not inherit them", () => {
    write("base.json", JSON.stringify({ references: [{ path: "./tsconfig.node.json" }] }));
    tsconfig({ module: "NodeNext" }, "tsconfig.node.json");
    write("tsconfig.json", JSON.stringify({ extends: "./base.json", files: [] }));

    expect(usesNodeResolution(root)).toBe(false);
  });
});
