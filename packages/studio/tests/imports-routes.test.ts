/**
 * The imports routes answer from the project Studio runs. They evaluate no
 * config of their own; they show the last good declarations while
 * courier.config does not load; they write files that belong to no import,
 * and remove an import, whatever state the config is in; and they write an
 * import's files only from the declaration on disk, refusing with a reason
 * while there is none that loads.
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadImportsState, recordImport, saveImportsState } from "../src/apis/imports-state";
import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import { withImportsLock } from "../src/server/imports-lock";
import type { StudioServer } from "../src/server/types";

/* Every evaluation of the config imports ./count, which adds one here. */
const EVALUATIONS = "courierImportsRoutesEvaluations";
const COUNTER = `Reflect.set(globalThis, "${EVALUATIONS}", Number(Reflect.get(globalThis, "${EVALUATIONS}") ?? 0) + 1);\nexport {};\n`;
const BROKEN = 'import "./count";\nthrow new Error("courier.config is broken on purpose");\n';

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Pets", version: "1" },
    paths: {
      "/pets": {
        get: { operationId: "listPets", tags: ["pets"], responses: { "200": { description: "ok" } } },
      },
    },
  }),
);
const ADD = { name: "pets", spec: SPEC, toAdd: { pets: ["listPets"] }, toRemove: {} };
const GENERATED = "export const pets = 1;\n";

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  Reflect.deleteProperty(globalThis, EVALUATIONS);
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-imports-routes-")));
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  Reflect.deleteProperty(globalThis, EVALUATIONS);
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function evaluations(): number {
  return Number(Reflect.get(globalThis, EVALUATIONS) ?? 0);
}

/* A config that declares one import, `pets`, generated under `outputDir`. */
function declaring(outputDir: string, head = ""): string {
  return `import "./count";\n${head}export default { sources: { api: { baseURL: "https://api.example" } }, imports: { pets: { importType: "file", type: "openapi", outputDir: "${outputDir}" } } };\n`;
}

function writeProjectFile(path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function project(config: string | null): void {
  writeProjectFile("count.ts", COUNTER);
  if (config !== null) writeProjectFile("courier.config.ts", config);
}

function start(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
}

interface Reply {
  status: number;
  body: unknown;
}

async function post(url: string, path: string, body: Record<string, unknown> = {}): Promise<Reply> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  return { status: response.status, body: payload };
}

/* Studio started, and its first load of the config has an outcome: a display route waits for it. */
async function started(): Promise<string> {
  const url = await start();
  await post(url, "/api/apis/imports/list");
  return url;
}

function writeFor(sourceName: string, path: string): Record<string, unknown> {
  return { files: [{ path, content: GENERATED }], sourceName, spec: SPEC, options: { type: "fetch" } };
}

/* Each route that writes an import's files, with a body that would write src/api/pets/index.ts. */
const ACT_ROUTES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["/api/apis/write", writeFor("pets", "src/api/pets/index.ts")],
  ["/api/apis/manage/apply", ADD],
  ["/api/apis/update/apply", { name: "pets", newSpec: SPEC, files: [{ path: "src/api/pets/index.ts", content: GENERATED }] }],
];

async function refusals(url: string): Promise<Array<{ route: string; status: number; body: unknown }>> {
  const replies = [];
  for (const [route, body] of ACT_ROUTES) replies.push({ route, ...(await post(url, route, body)) });
  return replies;
}

describe("the imports routes", () => {
  it("load nothing when nothing changed", async () => {
    project(declaring("src/api"));
    const url = await started();
    const calls: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["/api/apis/imports/list", {}],
      ["/api/apis/imports/check-updates", { name: "pets" }],
      ["/api/apis/imports/check-all", {}],
      ["/api/apis/manage/inventory", { name: "pets", newSpec: SPEC }],
      ["/api/apis/manage/preview", ADD],
      ["/api/apis/update/preview", { name: "pets", newSpec: SPEC }],
      ...ACT_ROUTES,
      ["/api/apis/imports/remove", { name: "pets" }],
    ];

    const seen = [];
    for (const [route, body] of calls) {
      const before = evaluations();
      const { status } = await post(url, route, body);
      seen.push({ route, status, loads: evaluations() - before });
    }

    expect(evaluations()).toBe(1);
    expect(seen).toEqual(
      calls.map(([route]) => ({
        route,
        /* A file import has no upstream to check. */
        status: route === "/api/apis/imports/check-updates" ? 400 : 200,
        loads: 0,
      })),
    );
  }, 15_000);

  it("manage/apply writes and persists from one declaration, and loads nothing", async () => {
    project(declaring("src/api"));
    const url = await started();
    const before = evaluations();

    const reply = await post(url, "/api/apis/manage/apply", ADD);

    expect(reply.status).toBe(200);
    expect(evaluations() - before).toBe(0);
    const generated = loadImportsState(root).imports.pets?.generatedFiles ?? [];
    expect(generated.length).toBeGreaterThan(0);
    expect(reply.body).toMatchObject({ success: true, written: generated.length, deleted: 0 });
    for (const file of generated) {
      expect(file.startsWith("src/api/")).toBe(true);
      expect(existsSync(join(root, file))).toBe(true);
    }
  }, 15_000);

  it("a route that arrives during the first load waits for it, and the config is evaluated once in total", async () => {
    project(declaring("src/api", "await new Promise((resolve) => setTimeout(resolve, 500));\n"));
    const url = await start();

    const reply = await post(url, "/api/apis/imports/list");

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ sources: [{ name: "pets", outputDir: "src/api" }] });
    expect(evaluations()).toBe(1);
  }, 15_000);
});

describe("the imports routes while a write to an import holds the imports lock", () => {
  function holdLock(): { release: () => Promise<void> } {
    const gate = Promise.withResolvers<void>();
    const held = withImportsLock(() => gate.promise);
    return {
      release: async () => {
        gate.resolve();
        await held;
      },
    };
  }

  it("a write with only files answers at once", async () => {
    project(declaring("src/api"));
    const url = await started();
    const lock = holdLock();

    const pending = post(url, "/api/apis/write", { files: [{ path: "src/mocks/pets.ts", content: GENERATED }] });
    const early = await Promise.race([pending, new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000))]);
    await lock.release();
    await pending;

    expect(early).toMatchObject({ status: 200, body: { written: 1 } });
    expect(existsSync(join(root, "src/mocks/pets.ts"))).toBe(true);
  }, 15_000);

  it("a remove answers for the declaration saved while it waited", async () => {
    project(declaring("src/api"));
    const url = await started();
    const lock = holdLock();

    const pending = post(url, "/api/apis/imports/remove", { name: "pets" });
    /* Long enough for a request that read the project before taking the lock to have read it. */
    await new Promise((resolve) => setTimeout(resolve, 300));
    writeProjectFile("courier.config.ts", declaring("src/api").replace("pets:", "cats:"));
    await lock.release();
    const reply = await pending;

    expect(reply).toEqual({ status: 404, body: { error: 'Import "pets" not found' } });
  }, 15_000);
});

describe("the imports routes while courier.config does not load", () => {
  it("a write with only files succeeds, and reads nothing", async () => {
    project(BROKEN);
    const url = await started();
    const before = evaluations();

    const reply = await post(url, "/api/apis/write", { files: [{ path: "src/mocks/pets.ts", content: GENERATED }] });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ written: 1 });
    expect(existsSync(join(root, "src/mocks/pets.ts"))).toBe(true);
    expect(evaluations() - before).toBe(0);
  }, 15_000);

  it("an import can be removed", async () => {
    project(BROKEN);
    writeProjectFile("src/api/pets/index.ts", GENERATED);
    saveImportsState(
      root,
      recordImport(loadImportsState(root), "pets", {
        specHash: "old",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        lastSyncedAt: "2026-01-01T00:00:00.000Z",
        userModified: [],
        generatedFiles: ["src/api/pets/index.ts"],
        fileFingerprints: {},
      }),
    );
    const url = await started();

    const reply = await post(url, "/api/apis/imports/remove", { name: "pets" });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ success: true, removedFiles: ["src/api/pets/index.ts"] });
    expect(existsSync(join(root, "src/api/pets/index.ts"))).toBe(false);
    expect(loadImportsState(root).imports).toEqual({});
  }, 15_000);

  it("a display route serves the last good declarations", async () => {
    project(declaring("src/api"));
    const url = await started();
    writeProjectFile("courier.config.ts", BROKEN);

    const list = await post(url, "/api/apis/imports/list");
    const inventory = await post(url, "/api/apis/manage/inventory", { name: "pets", newSpec: SPEC });

    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ sources: [{ name: "pets", outputDir: "src/api" }] });
    expect(inventory.status).toBe(200);
    expect(inventory.body).toMatchObject({ specChanged: true });
    /* The first load, and the reload of the broken save the list caught up with. */
    expect(evaluations()).toBe(2);
  }, 15_000);

  it("the routes that write an import's files refuse 409 CONFIG_NOT_LOADING, and write nothing", async () => {
    project(declaring("src/api"));
    const url = await started();
    writeProjectFile("courier.config.ts", BROKEN);

    const replies = await refusals(url);

    expect(replies).toEqual(
      ACT_ROUTES.map(([route]) => ({
        route,
        status: 409,
        body: { code: "CONFIG_NOT_LOADING", error: expect.stringContaining("Fix courier.config") },
      })),
    );
    expect(existsSync(join(root, "src/api"))).toBe(false);
    expect(loadImportsState(root).imports).toEqual({});
  }, 15_000);

  it("manage/apply and update/apply write nothing when it never loaded", async () => {
    project(BROKEN);
    const url = await started();

    const replies = await refusals(url);

    expect(replies.map(({ status }) => status < 400)).toEqual([false, false, false]);
    expect(existsSync(join(root, "src/api"))).toBe(false);
    expect(existsSync(join(root, ".courier/imports-state.json"))).toBe(false);
  }, 15_000);
});

describe("the imports routes with no courier.config", () => {
  it("refuse to write an import's files with 409 CONFIG_MISSING once courier.config is deleted", async () => {
    project(declaring("src/api"));
    const url = await started();
    unlinkSync(join(root, "courier.config.ts"));

    const replies = await refusals(url);

    expect(replies).toEqual(
      ACT_ROUTES.map(([route]) => ({
        route,
        status: 409,
        body: { code: "CONFIG_MISSING", error: expect.stringContaining("Create courier.config.ts first") },
      })),
    );
    expect(existsSync(join(root, "src/api"))).toBe(false);
  }, 15_000);

  it("refuse to write an import's files with 409 CONFIG_MISSING in a project that never had one", async () => {
    project(null);
    const url = await started();

    const replies = await refusals(url);

    expect(replies.map(({ status, body }) => ({ status, body }))).toEqual(
      ACT_ROUTES.map(() => ({ status: 409, body: expect.objectContaining({ code: "CONFIG_MISSING" }) })),
    );
    expect(existsSync(join(root, "src/api"))).toBe(false);
  }, 15_000);
});

describe("a write for an import, after courier.config moved its output directory", () => {
  function staleFiles(): void {
    writeProjectFile("src/old/pets/stale.ts", GENERATED);
    writeProjectFile("src/new/pets/stale.ts", GENERATED);
  }

  it("cleans only the newly saved directory when it comes right after the save", async () => {
    project(declaring("src/old"));
    const url = await started();
    staleFiles();
    writeProjectFile("courier.config.ts", declaring("src/new"));

    const reply = await post(url, "/api/apis/write", writeFor("pets", "src/new/pets/index.ts"));

    expect(reply.status).toBe(200);
    expect(existsSync(join(root, "src/new/pets/stale.ts"))).toBe(false);
    expect(existsSync(join(root, "src/new/pets/index.ts"))).toBe(true);
    expect(existsSync(join(root, "src/old/pets/stale.ts"))).toBe(true);
  }, 15_000);

  it("acts on the saved declaration when it waited for the imports lock while courier.config was saved", async () => {
    project(declaring("src/old"));
    const url = await started();
    staleFiles();
    const gate = Promise.withResolvers<void>();
    const held = withImportsLock(() => gate.promise);

    const pending = post(url, "/api/apis/write", writeFor("pets", "src/new/pets/index.ts"));
    /* Long enough for a request that read the project before taking the lock to have read it. */
    await new Promise((resolve) => setTimeout(resolve, 300));
    writeProjectFile("courier.config.ts", declaring("src/new"));
    gate.resolve();
    await held;
    const reply = await pending;

    expect(reply.status).toBe(200);
    expect(existsSync(join(root, "src/new/pets/stale.ts"))).toBe(false);
    expect(existsSync(join(root, "src/old/pets/stale.ts"))).toBe(true);
  }, 15_000);
});
