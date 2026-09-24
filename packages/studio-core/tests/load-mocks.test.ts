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
import { findMocksFile, loadCourierMocksFile, readMocksExport } from "../src/runtime/load-mocks";
import type { TransformCache } from "../src/runtime/transform-cache";
import { createTransformCache } from "../src/runtime/transform-cache";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-load-mocks-")));
});

afterEach(() => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe("findMocksFile", () => {
  it("finds nothing in a project that declares no mocks", () => {
    expect(findMocksFile(dir)).toBeNull();
  });

  it("takes courier.mocks.ts before the other names", () => {
    writeFileSync(join(dir, "courier.mocks.js"), "export default {};\n");
    writeFileSync(join(dir, "courier.mocks.ts"), "export default {};\n");

    expect(findMocksFile(dir)).toBe(join(dir, "courier.mocks.ts"));
  });

  it("counts a link whose target is gone as present, so it can be reported", () => {
    symlinkSync(join(dir, "gone.ts"), join(dir, "courier.mocks.mjs"));

    expect(findMocksFile(dir)).toBe(join(dir, "courier.mocks.mjs"));
  });
});

describe("readMocksExport", () => {
  const file = "/p/courier.mocks.ts";

  it("reads the mocks from the default export", () => {
    const mocks = { api: { source: {} } };

    expect(readMocksExport({ default: mocks }, file)).toBe(mocks);
  });

  it("reads no mocks from a file with no statements", () => {
    expect(readMocksExport({}, file)).toEqual({});
  });

  it("names the default export a file with only named exports is missing", () => {
    expect(() => readMocksExport({ apiMock: {} }, file)).toThrow(
      "/p/courier.mocks.ts has no default export; export default defineMocks({ ... })",
    );
  });

  it.each([
    ["an array", []],
    ["a string", "api"],
    ["null", null],
  ])("rejects a default export that is %s", (_, value) => {
    expect(() => readMocksExport({ default: value }, file)).toThrow("must export an object of mocks by key");
  });
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

  it("reports a mocks file that does not load", async () => {
    writeFileSync(join(dir, "courier.mocks.ts"), 'import { missing } from "./missing";\nexport default { missing };\n');

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
    write("courier.mocks.ts", 'import { port } from "./port";\nexport default { api: { port } };\n');
    const directory = join(dir, "transforms");
    const studio = counting(createTransformCache({ directory }));
    const worker = counting(createTransformCache({ directory }));

    await loadCourierMocksFile(join(dir, "courier.mocks.ts"), { transformCache: studio.cache });
    const loaded = await loadCourierMocksFile(join(dir, "courier.mocks.ts"), { transformCache: worker.cache });

    expect(studio.computed.sort()).toEqual([join(dir, "courier.mocks.ts"), join(dir, "port.ts")]);
    expect(worker.computed).toEqual([]);
    expect(loaded.mocks).toEqual({ api: { port: 7001 } });
  });

  it("a mock worker's read-only cache reuses what Studio kept and adds nothing to the directory", async () => {
    write("port.ts", "export const port: number = 7001;\n");
    write("courier.mocks.ts", 'import { port } from "./port";\nexport default { api: { port } };\n');
    const directory = join(dir, "transforms");
    await loadCourierMocksFile(join(dir, "courier.mocks.ts"), { transformCache: createTransformCache({ directory }) });
    const kept = readdirSync(directory).sort();
    write("host.ts", 'export const host = "localhost";\n');
    write(
      "courier.mocks.ts",
      'import { host } from "./host";\nimport { port } from "./port";\nexport default { api: { host, port } };\n',
    );
    const worker = counting(createTransformCache({ directory, readOnly: true, maxMemoryChars: 0 }));

    const loaded = await loadCourierMocksFile(join(dir, "courier.mocks.ts"), { transformCache: worker.cache });

    expect(worker.computed.sort()).toEqual([join(dir, "courier.mocks.ts"), join(dir, "host.ts")]);
    expect(readdirSync(directory).sort()).toEqual(kept);
    expect(loaded.mocks).toEqual({ api: { host: "localhost", port: 7001 } });
  });

  it("resolves to the installed package when aliases are off", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@app/*": ["./src/*"] } } }));
    write("src/port.ts", "export const port = 1;\n");
    write("node_modules/@app/port/package.json", JSON.stringify({ name: "@app/port", main: "index.js" }));
    write("node_modules/@app/port/index.js", "exports.port = 2;\n");
    write("courier.mocks.ts", 'import { port } from "@app/port";\nexport default { api: { port } };\n');

    const aliased = await loadCourierMocksFile(join(dir, "courier.mocks.ts"));
    const installed = await loadCourierMocksFile(join(dir, "courier.mocks.ts"), { aliases: false });

    expect(aliased.mocks).toEqual({ api: { port: 1 } });
    expect(installed.mocks).toEqual({ api: { port: 2 } });
  });
});
