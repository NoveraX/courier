/**
 * Declaring and removing an imported API through Studio, end to end on a
 * real Studio, when courier.config.ts takes its `sources` from a module of
 * the project (`import { sources } from "./lib/sources"`): the source is
 * listed in that module and the import declared in the config, both files
 * written or neither; a save to either between preview and apply; a change
 * that does not load, which puts both back; a module Studio cannot add to;
 * and the removal, which takes the import out of both.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const CACHE = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");

const API =
  'import { courier, defineApi, defineGroup } from "@noverax/courier/define";\n' +
  "const { endpoint } = courier();\n" +
  'const users = defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response<{ id: number }[]>() } });\n' +
  'export const api = defineApi({ baseURL: "https://api.example", groups: { users } });\n';

const CONFIG = 'import { sources } from "./lib/sources";\n\nexport default {\n  sources,\n};\n';
const SOURCES = 'import { api } from "../src/api";\n\nexport const sources = { api };\n';
const SOURCES_FILE = "lib/sources.ts";

const IMPORT = {
  sourceName: "petstore",
  spec: parseSpec(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Pets", version: "1" },
      servers: [{ url: "https://pets.example" }],
      paths: {
        "/pets": {
          get: {
            operationId: "listPets",
            tags: ["pets"],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    }),
  ),
  options: { type: "openapi", outputDir: "src/gen", sourceName: "petstore" },
  importType: "raw",
};

const SOURCE = "src/gen/petstore/source.ts";

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

function start(files: Record<string, string> = {}): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  root = realpathSync(mkdtempSync(join(CACHE, "config-sources-module ")));
  const all = { "src/api.ts": API, "courier.config.ts": CONFIG, [SOURCES_FILE]: SOURCES, ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

async function post(url: string, path: string, body: unknown) {
  const headers = { "content-type": "application/json", origin: url, ...tokenHeader(studio) };
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

/* The import written, and the change that declares it, as the wizard shows it. */
async function written(url: string) {
  const write = await post(url, "/api/apis/write", IMPORT);
  expect(write.status).toBe(200);
  const preview = await post(url, "/api/apis/declare/preview", IMPORT);
  return { write: write.body, preview: preview.body };
}

async function declared(url: string): Promise<void> {
  const { preview } = await written(url);
  const applied = await post(url, "/api/apis/declare/apply", {
    ...IMPORT,
    baseHash: preview.baseHash,
  });
  expect(applied.body).toEqual({ status: "applied", files: [SOURCES_FILE, "courier.config.ts"] });
}

describe("declaring an import when courier.config.ts takes its sources from a module", () => {
  it("lists the source in the module and declares the import in the config", async () => {
    const url = await start();
    const { write, preview } = await written(url);

    expect(write.declaration).toMatchObject({
      configFile: "courier.config.ts",
      sourcesFile: SOURCES_FILE,
      source: { importLine: 'import { petstore } from "../src/gen/petstore/source";' },
    });
    expect(preview).toMatchObject({ status: "ready", configFile: "courier.config.ts" });
    expect((preview.files as { file: string }[]).map((change) => change.file)).toEqual([
      SOURCES_FILE,
      "courier.config.ts",
    ]);
    const applied = await post(url, "/api/apis/declare/apply", {
      ...IMPORT,
      baseHash: preview.baseHash,
    });

    expect(applied.body).toEqual({ status: "applied", files: [SOURCES_FILE, "courier.config.ts"] });
    expect(read(SOURCES_FILE)).toBe(
      'import { api } from "../src/api";\nimport { petstore } from "../src/gen/petstore/source";\n\nexport const sources = { api, petstore };\n',
    );
    expect(read("courier.config.ts")).toContain("  sources,\n  imports: {\n    petstore: {\n");
    expect(read("courier.config.ts")).not.toContain("gen/petstore");
    expect((await post(url, "/api/apis/declare/preview", IMPORT)).body).toEqual({
      status: "declared",
    });
  }, 30_000);

  it.each([
    [
      "the module's default export",
      'import sources from "./lib/sources";\n\nexport default {\n  sources,\n};\n',
      'import { api } from "../src/api";\n\nexport default { api };\n',
      "export default { api, petstore };",
    ],
    [
      "a name the module exports under another",
      'import { sources } from "./lib/sources";\n\nexport default {\n  sources,\n};\n',
      'import { api } from "../src/api";\n\nconst all = { api } satisfies Record<string, unknown>;\n\nexport { all as sources };\n',
      "const all = { api, petstore } satisfies Record<string, unknown>;",
    ],
  ])(
    "lists the source in %s",
    async (_, config, sources, listed) => {
      const url = await start({ "courier.config.ts": config, [SOURCES_FILE]: sources });

      await declared(url);

      expect(read(SOURCES_FILE)).toContain(listed);
    },
    30_000,
  );

  it("lists the source in a module the config imports through a tsconfig path alias", async () => {
    const tsconfig = JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } },
    });
    const url = await start({
      "tsconfig.json": tsconfig,
      "courier.config.ts": CONFIG.replace("./lib/sources", "@/lib/sources"),
    });

    await declared(url);

    expect(read(SOURCES_FILE)).toContain("export const sources = { api, petstore };");
  }, 30_000);

  it("changes neither file when the module was saved after the preview", async () => {
    const url = await start();
    const { preview } = await written(url);
    const saved = `${SOURCES}// saved meanwhile\n`;
    writeFileSync(join(root, SOURCES_FILE), saved);

    const applied = await post(url, "/api/apis/declare/apply", {
      ...IMPORT,
      baseHash: preview.baseHash,
    });

    expect(applied.body).toMatchObject({ status: "stale", preview: { status: "ready" } });
    expect(read(SOURCES_FILE)).toBe(saved);
    expect(read("courier.config.ts")).toBe(CONFIG);
  }, 30_000);

  it("puts both files back when the changed config does not load", async () => {
    const url = await start();
    const { preview } = await written(url);
    rmSync(join(root, "src", "gen"), { recursive: true, force: true });

    const applied = await post(url, "/api/apis/declare/apply", {
      ...IMPORT,
      baseHash: preview.baseHash,
    });

    expect(applied.body).toMatchObject({ status: "manual", code: "NOT_LOADED" });
    expect(String(applied.body.reason)).toContain(
      "put lib/sources.ts and courier.config.ts back as they were",
    );
    expect(read(SOURCES_FILE)).toBe(SOURCES);
    expect(read("courier.config.ts")).toBe(CONFIG);
  }, 30_000);

  it("leaves a module that builds its sources through a call to the developer, naming it", async () => {
    const sources =
      'import { api } from "../src/api";\n\nfunction all() {\n  return { api };\n}\n\nexport const sources = all();\n';
    const url = await start({ [SOURCES_FILE]: sources });

    const { preview } = await written(url);

    expect(preview).toMatchObject({
      status: "manual",
      code: "LIST_SHAPE",
      declaration: { sourcesFile: SOURCES_FILE },
    });
    expect(String(preview.reason)).toContain("lib/sources.ts builds `sources` through a call");
    expect(read(SOURCES_FILE)).toBe(sources);
  }, 30_000);
});

describe("removing an import listed in the module the config takes its sources from", () => {
  async function removal(url: string) {
    const shown = await post(url, "/api/apis/imports/remove/preview", { name: "petstore" });
    const plan = shown.body.plan as { digest: string };
    const change = shown.body.config as {
      status: string;
      baseHash: string;
      files: { file: string }[];
    };
    return { plan, change };
  }

  it("takes the import out of both files, then removes its files", async () => {
    const url = await start();
    await declared(url);
    const { plan, change } = await removal(url);
    expect(change.files.map((file) => file.file)).toEqual([SOURCES_FILE, "courier.config.ts"]);

    const removed = await post(url, "/api/apis/imports/remove", {
      name: "petstore",
      planDigest: plan.digest,
      configBaseHash: change.baseHash,
    });

    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      undeclaredFrom: [SOURCES_FILE, "courier.config.ts"],
      configFile: "courier.config.ts",
      importDeclared: false,
    });
    expect(read(SOURCES_FILE)).toBe(SOURCES);
    expect(read("courier.config.ts")).toBe(CONFIG);
    expect(existsSync(join(root, SOURCE))).toBe(false);
  }, 30_000);

  it("removes nothing when the module was saved after the preview, naming both files", async () => {
    const url = await start();
    await declared(url);
    const { plan, change } = await removal(url);
    const saved = `${read(SOURCES_FILE)}// saved meanwhile\n`;
    writeFileSync(join(root, SOURCES_FILE), saved);

    const removed = await post(url, "/api/apis/imports/remove", {
      name: "petstore",
      planDigest: plan.digest,
      configBaseHash: change.baseHash,
    });

    expect(removed.status).toBe(409);
    expect(removed.body).toMatchObject({ code: "CONFIG_STALE" });
    expect(String(removed.body.error ?? removed.body.message)).toContain(
      "lib/sources.ts or courier.config.ts changed since you saw the change",
    );
    expect(read(SOURCES_FILE)).toBe(saved);
    expect(existsSync(join(root, SOURCE))).toBe(true);
  }, 30_000);
});
