/**
 * @vitest-environment node
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCourierMocksFile } from "../src/runtime/load-courier-mocks-file";
import type { TransformCache } from "../src/runtime/transform-cache";
import { createTransformCache } from "../src/runtime/transform-cache";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-load-mocks-file-")));
});

afterEach(() => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe("loadCourierMocksFile", () => {
  it("loads a TypeScript mocks file with a top-level await, through a link", async () => {
    writeFileSync(
      join(dir, "mocks.ts"),
      "const port: number = await Promise.resolve(7001);\nexport default { api: { port } };\n",
    );
    symlinkSync(join(dir, "mocks.ts"), join(dir, "courier.mocks.ts"));

    const loaded = await loadCourierMocksFile(join(dir, "courier.mocks.ts"));

    expect(loaded).toEqual({ mocks: { api: { port: 7001 } }, mocksFile: join(dir, "mocks.ts") });
  });

  it.each([
    [
      "courier.mocks.ts",
      "const enabled: boolean = false;\nexport default enabled ? { api: { port: 1 } } : undefined;\n",
    ],
    ["courier.mocks.mjs", "export default undefined;\n"],
    ["courier.mocks.cjs", "module.exports = undefined;\n"],
  ])("reads no mocks from a %s whose default export is undefined", async (name, source) => {
    writeFileSync(join(dir, name), source);

    const loaded = await loadCourierMocksFile(join(dir, name));

    expect(loaded.mocks).toStrictEqual({});
  });

  it("reads a courier.mocks.cjs Node cannot run, its module.exports its mocks", async () => {
    writeFileSync(
      join(dir, "courier.mocks.cjs"),
      "const port = await Promise.resolve(7001);\nmodule.exports = { api: { port } };\n",
    );

    const loaded = await loadCourierMocksFile(join(dir, "courier.mocks.cjs"));

    expect(loaded.mocks).toEqual({ api: { port: 7001 } });
  });

  it("reports a mocks file that does not load", async () => {
    writeFileSync(
      join(dir, "courier.mocks.ts"),
      'import { missing } from "./missing";\nexport default { missing };\n',
    );

    await expect(loadCourierMocksFile(join(dir, "courier.mocks.ts"))).rejects.toThrow(/missing/);
  });
});

describe("loadCourierMocksFile — loader options", () => {
  function write(relative: string, contents: string): void {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    writeFileSync(join(dir, relative), contents);
  }

  /** Wraps a cache to record the file of every transform it had to compute. */
  function counting(inner: TransformCache): { cache: TransformCache; computed: string[] } {
    const computed: string[] = [];
    const cache: TransformCache = {
      transform: (options, compute) =>
        inner.transform(options, (miss) => {
          computed.push(miss.filename ?? "");
          return compute(miss);
        }),
    };
    return { cache, computed };
  }

  it("transforms through the cache it is given, once while the file is unchanged", async () => {
    write("courier.mocks.ts", "const port: number = 7001;\nexport default { api: { port } };\n");
    const { cache: transformCache, computed } = counting(createTransformCache());

    await loadCourierMocksFile(join(dir, "courier.mocks.ts"), { transformCache });
    const second = await loadCourierMocksFile(join(dir, "courier.mocks.ts"), { transformCache });

    expect(computed).toEqual([join(dir, "courier.mocks.ts")]);
    expect(second.mocks).toEqual({ api: { port: 7001 } });
  });

  it("a mocks file loaded through a new cache on the same directory transforms nothing, as in a mock worker", async () => {
    write("port.ts", "export const port: number = 7001;\n");
    write(
      "courier.mocks.ts",
      'import { port } from "./port";\nexport default { api: { port } };\n',
    );
    const directory = join(dir, "transforms");
    const studio = counting(createTransformCache({ directory }));
    const worker = counting(createTransformCache({ directory }));

    await loadCourierMocksFile(join(dir, "courier.mocks.ts"), { transformCache: studio.cache });
    const loaded = await loadCourierMocksFile(join(dir, "courier.mocks.ts"), {
      transformCache: worker.cache,
    });

    expect(studio.computed.sort()).toEqual([join(dir, "courier.mocks.ts"), join(dir, "port.ts")]);
    expect(worker.computed).toEqual([]);
    expect(loaded.mocks).toEqual({ api: { port: 7001 } });
  });

  it("a mock worker's read-only cache reuses what Studio kept and adds nothing to the directory", async () => {
    write("port.ts", "export const port: number = 7001;\n");
    write(
      "courier.mocks.ts",
      'import { port } from "./port";\nexport default { api: { port } };\n',
    );
    const directory = join(dir, "transforms");
    await loadCourierMocksFile(join(dir, "courier.mocks.ts"), {
      transformCache: createTransformCache({ directory }),
    });
    const kept = readdirSync(directory).sort();
    write("host.ts", 'export const host = "localhost";\n');
    write(
      "courier.mocks.ts",
      'import { host } from "./host";\nimport { port } from "./port";\nexport default { api: { host, port } };\n',
    );
    const worker = counting(createTransformCache({ directory, readOnly: true, maxMemoryChars: 0 }));

    const loaded = await loadCourierMocksFile(join(dir, "courier.mocks.ts"), {
      transformCache: worker.cache,
    });

    expect(worker.computed.sort()).toEqual([join(dir, "courier.mocks.ts"), join(dir, "host.ts")]);
    expect(readdirSync(directory).sort()).toEqual(kept);
    expect(loaded.mocks).toEqual({ api: { host: "localhost", port: 7001 } });
  });

  it("resolves an installed package of an aliased scope to the package, with aliases on or off", async () => {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { paths: { "@app/*": ["./src/*"] } } }),
    );
    write("src/port.ts", "export const port = 1;\n");
    write(
      "node_modules/@app/port/package.json",
      JSON.stringify({ name: "@app/port", main: "index.js" }),
    );
    write("node_modules/@app/port/index.js", "exports.port = 2;\n");
    write(
      "courier.mocks.ts",
      'import { port } from "@app/port";\nexport default { api: { port } };\n',
    );

    const aliased = await loadCourierMocksFile(join(dir, "courier.mocks.ts"));
    const plain = await loadCourierMocksFile(join(dir, "courier.mocks.ts"), { aliases: false });

    expect(aliased.mocks).toEqual({ api: { port: 2 } });
    expect(plain.mocks).toEqual({ api: { port: 2 } });
  });

  it("follows the project's path aliases only when they are on", async () => {
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { paths: { "@app/*": ["./src/*"] } } }),
    );
    write("src/local.ts", "export const port = 1;\n");
    write(
      "courier.mocks.ts",
      'import { port } from "@app/local";\nexport default { api: { port } };\n',
    );

    const aliased = await loadCourierMocksFile(join(dir, "courier.mocks.ts"));

    expect(aliased.mocks).toEqual({ api: { port: 1 } });
    await expect(
      loadCourierMocksFile(join(dir, "courier.mocks.ts"), { aliases: false }),
    ).rejects.toThrow("@app/local");
  });
});
