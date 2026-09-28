/**
 * @vitest-environment node
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type * as JitiModule from "jiti";
import type { TransformOptions } from "jiti";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { createJiti } from "jiti";
import { createConfigJiti } from "../src/runtime/config-jiti";
import type { TransformCache } from "../src/runtime/transform-cache";
import { createTransformCache } from "../src/runtime/transform-cache";

vi.mock("jiti", async (importOriginal) => {
  const actual = await importOriginal<typeof JitiModule>();
  return { ...actual, createJiti: vi.fn(actual.createJiti) };
});

let root: string;

function write(relative: string, contents: string): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

interface Handed {
  options: TransformOptions;
  code: string;
}

/** A real cache that also records what it hands jiti for each module. */
function recordingCache(handed: Handed[]): TransformCache {
  const cache = createTransformCache();
  return {
    transform(options, compute) {
      const result = cache.transform(options, compute);
      handed.push({ options, code: result.code });
      return result;
    },
  };
}

/** What jiti hands its transform for a TypeScript module the loader imports. */
function importedModule(file: string): TransformOptions {
  return {
    filename: file,
    source: readFileSync(file, "utf8"),
    ts: true,
    async: true,
    jsx: false,
    interopDefault: true,
    babel: {},
  };
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-config-jiti-")));
  write("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@app/*": ["./src/*"] } } }));
  write("src/value.ts", 'export const origin = "project";\n');
  write("src/shared.ts", 'export const origin = "project";\n');
  write("node_modules/@app/shared/package.json", JSON.stringify({ name: "@app/shared", main: "index.js" }));
  write("node_modules/@app/shared/index.js", 'exports.origin = "installed";\n');
  write("entry.ts", 'export { origin } from "@app/value";\n');
  write("packaged.ts", 'export { origin } from "@app/shared";\n');
  vi.mocked(createJiti).mockClear();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("createConfigJiti", () => {
  it("resolves an import through the project's path aliases by default", async () => {
    const jiti = await createConfigJiti(join(root, "entry.ts"));

    const loaded = await jiti.import<{ origin: string }>(join(root, "entry.ts"));

    expect(loaded.origin).toBe("project");
  });

  it("leaves the project's path aliases unfollowed with aliases off", async () => {
    const jiti = await createConfigJiti(join(root, "entry.ts"), { aliases: false });

    await expect(jiti.import(join(root, "entry.ts"))).rejects.toThrow("Cannot find module '@app/value'");
  });

  it("takes an installed package of an aliased scope past the alias, as TypeScript does", async () => {
    /* The alias led every name of the scope to src, so an installed package
       loaded the project's file of the same name instead of its build. */
    const aliased = await createConfigJiti(join(root, "packaged.ts"));
    const plain = await createConfigJiti(join(root, "packaged.ts"), { aliases: false });

    expect((await aliased.import<{ origin: string }>(join(root, "packaged.ts"))).origin).toBe("installed");
    expect((await plain.import<{ origin: string }>(join(root, "packaged.ts"))).origin).toBe("installed");
  });

  it("loads a config in a project whose tsconfig maps every specifier with `*`", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "*": ["./types/*"], "@app/*": ["./src/*"] } } }));
    const jiti = await createConfigJiti(join(root, "entry.ts"));

    const loaded = await jiti.import<{ origin: string }>(join(root, "entry.ts"));

    expect(loaded.origin).toBe("project");
  });

  it("without a cache, leaves jiti its own transform and no file cache, so nothing is memoized", async () => {
    await createConfigJiti(join(root, "entry.ts"));

    expect(createJiti).toHaveBeenCalledTimes(1);
    const options = vi.mocked(createJiti).mock.calls[0]?.[1];
    expect(options).toMatchObject({ interopDefault: true, moduleCache: false, fsCache: false });
    expect(options).not.toHaveProperty("transform");
  });
});

describe("createConfigJiti with a transform cache", () => {
  it("hands jiti exactly the code its own transform produces", async () => {
    const file = join(root, "typed.ts");
    write("dep.cjs", 'module.exports = { name: "dep" };\n');
    write("late.ts", 'export const late: string = "late";\n');
    write(
      "typed.ts",
      [
        'import type { Readable } from "node:stream";',
        'import dep from "./dep.cjs";',
        "interface Where { url: string; dir: string; dep: string; late: string; stream?: Readable }",
        'const { late } = await import("./late");',
        "const where: Where = { url: import.meta.url, dir: __dirname, dep: dep.name, late };",
        "export default where;",
        "",
      ].join("\n"),
    );
    const handed: Handed[] = [];
    const jiti = await createConfigJiti(file, { transformCache: recordingCache(handed) });

    const loaded = await jiti.import<Record<string, string>>(file, { default: true });

    const modules = [file, join(root, "late.ts")];
    expect(handed.map(({ options }) => options)).toStrictEqual(modules.map(importedModule));
    const own = await createConfigJiti(file);
    const ownCode = modules.map((filename) => {
      const { source } = importedModule(filename);
      return own.transform({ filename, source, ts: true, async: true, jsx: false });
    });
    expect(handed.map(({ code }) => code)).toStrictEqual(ownCode);
    expect(loaded).toEqual({ url: pathToFileURL(file).href, dir: root, dep: "dep", late: "late" });
  });

  it("keeps jiti's own file and module caches off", async () => {
    const jiti = await createConfigJiti(join(root, "entry.ts"), {
      transformCache: createTransformCache(),
    });

    await jiti.import(join(root, "entry.ts"));

    const calls = vi.mocked(createJiti).mock.calls;
    const loading = calls.filter(([, options]) => options?.transform !== undefined);
    expect(loading).toHaveLength(1);
    expect(loading[0]?.[1]).toMatchObject({ interopDefault: true, fsCache: false, moduleCache: false });
    for (const [, options] of calls) expect(options).toMatchObject({ fsCache: false, moduleCache: false });
  });

  it("reports every failed transform under JITI_DEBUG, as jiti does without a cache", async () => {
    vi.stubEnv("JITI_DEBUG", "1");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    onTestFinished(() => {
      log.mockRestore();
      vi.unstubAllEnvs();
    });
    const file = join(root, "broken.ts");
    write("broken.ts", "export default {\n");
    const transformCache = createTransformCache();
    const loads: Array<TransformCache | undefined> = [undefined, undefined, transformCache, transformCache];

    for (const cache of loads) {
      const jiti = await createConfigJiti(file, { transformCache: cache });
      await expect(jiti.import(file)).rejects.toThrow("Unexpected token");
    }

    const reports = log.mock.calls.filter(([line]) => String(line).includes('"reasonCode":"UnexpectedToken"'));
    expect(reports).toHaveLength(4);
  });

  it("keeps resolving through the path aliases, or around them when they are off", async () => {
    const transformCache = createTransformCache();
    const aliased = await createConfigJiti(join(root, "entry.ts"), { transformCache });
    const plain = await createConfigJiti(join(root, "entry.ts"), { aliases: false, transformCache });

    const viaAliases = await aliased.import<{ origin: string }>(join(root, "entry.ts"));

    expect(viaAliases.origin).toBe("project");
    await expect(plain.import(join(root, "entry.ts"))).rejects.toThrow("Cannot find module '@app/value'");
  });
});
