/**
 * How Studio's loads of a project reuse the transforms of its modules: a
 * module is transformed once while its bytes stay the same and again once
 * they change, and the next Studio process finds them in the project's
 * node_modules.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTransformCache, type TransformCache } from "@noverax/courier-studio-core/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type LoadedCourierConfig, loadCourierConfig } from "../src/server/config-loader";

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Project {
  root: string;
  config: string;
  api: string;
  host: string;
  mocks: string;
}

/** A config that imports a module, which imports another, and a mocks file beside it. */
function makeProject({
  mocks = 'import { api } from "./src/api";\nexport default { apiMock: { source: api } };\n',
} = {}): Project {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "courier-transform-loads-")));
  roots.push(root);
  mkdirSync(join(root, "src"));
  const project = {
    root,
    config: join(root, "courier.config.ts"),
    api: join(root, "src", "api.ts"),
    host: join(root, "src", "host.ts"),
    mocks: join(root, "courier.mocks.ts"),
  };
  writeFileSync(project.host, 'export const host: string = "v1.example.com";\n');
  writeFileSync(
    project.api,
    'import { host } from "./host";\nexport const api = { baseURL: host };\n',
  );
  writeFileSync(
    project.config,
    'import { api } from "./src/api";\nexport default { sources: { api } };\n',
  );
  writeFileSync(project.mocks, mocks);
  return project;
}

/** Wraps a cache to record the file of every transform asked of it, and of every one it computed. */
function counting(inner: TransformCache): {
  cache: TransformCache;
  asked: string[];
  computed: string[];
} {
  const asked: string[] = [];
  const computed: string[] = [];
  const cache: TransformCache = {
    transform: (options, compute) => {
      asked.push(options.filename ?? "");
      return inner.transform(options, (miss) => {
        computed.push(miss.filename ?? "");
        return compute(miss);
      });
    },
  };
  return { cache, asked, computed };
}

function baseURLOf(loaded: LoadedCourierConfig): unknown {
  return (loaded.config.sources.api as { baseURL?: unknown }).baseURL;
}

describe("loadCourierConfig through a transform cache", () => {
  it("a second load of an unchanged project transforms nothing", async () => {
    const project = makeProject();
    const { cache: transformCache, computed } = counting(createTransformCache());

    await loadCourierConfig(project.root, { transformCache });
    const first = computed.splice(0);
    const second = await loadCourierConfig(project.root, { transformCache });

    expect(first).toEqual(
      expect.arrayContaining([project.config, project.api, project.host, project.mocks]),
    );
    expect(computed).toEqual([]);
    expect(baseURLOf(second)).toBe("v1.example.com");
  });

  it("a load after editing one module transforms only it and sees the edit", async () => {
    const project = makeProject();
    const { cache: transformCache, computed } = counting(createTransformCache());
    await loadCourierConfig(project.root, { transformCache });
    computed.length = 0;

    writeFileSync(project.host, 'export const host: string = "v2.example.com";\n');
    const edited = await loadCourierConfig(project.root, { transformCache });

    expect(computed).toEqual([project.host]);
    expect(baseURLOf(edited)).toBe("v2.example.com");
  });

  it("a config whose mocks file does not load is transformed once", async () => {
    const project = makeProject({
      mocks: 'import { missing } from "./missing";\nexport default { missing };\n',
    });
    const { cache: transformCache, asked, computed } = counting(createTransformCache());

    const loaded = await loadCourierConfig(project.root, { transformCache });

    expect(String(loaded.mocks.error)).toMatch(/missing/);
    expect(asked.filter((file) => file === project.config)).toHaveLength(1);
    expect(computed.filter((file) => file === project.config)).toHaveLength(1);
  });
});

describe("loadCourierConfig across Studio processes", () => {
  it("keeps the transforms in the project's node_modules, so the next process transforms nothing", async () => {
    vi.stubEnv("COURIER_TRANSFORM_CACHE", "on");
    const project = makeProject();
    mkdirSync(join(project.root, "node_modules"));
    const directory = join(project.root, "node_modules", ".cache", "courier", "transform");
    await loadCourierConfig(project.root);
    const nextProcess = counting(createTransformCache({ directory }));

    const loaded = await loadCourierConfig(project.root, { transformCache: nextProcess.cache });

    expect(nextProcess.asked).toEqual(
      expect.arrayContaining([project.config, project.api, project.host, project.mocks]),
    );
    expect(nextProcess.computed).toEqual([]);
    expect(baseURLOf(loaded)).toBe("v1.example.com");
  });
});
