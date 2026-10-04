/**
 * The imports routes answer from the project Studio runs. They evaluate no
 * config of their own; they show the last good declarations while
 * courier.config does not load; they write files that belong to no import,
 * and remove an import, whatever state the config is in; and they write an
 * import's files only from the declaration on disk, refusing with a reason
 * while there is none that loads. A check of URL imports reads which private
 * hosts the project allows once, only for a private host, and never from the
 * last config that loaded.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { io as connect } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadImportsState, recordImport, saveImportsState } from "../src/apis/imports-state";
import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import { bodyHash } from "../src/server/import-files/body-hash";
import { signGeneratedFile } from "../src/server/import-files/generated-header";
import { withImportsLock } from "../src/server/imports-lock";
import { ACT_BUDGET_MS } from "../src/server/project-state/budgets";
import type { FreshSnapshot, ProjectImports } from "../src/server/project-state/types";
import { registerRegistryRoutes } from "../src/server/registry-routes";
import type { JsonResponse, RouteApp } from "../src/server/route-types";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

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
        get: {
          operationId: "listPets",
          tags: ["pets"],
          responses: { "200": { description: "ok" } },
        },
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
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

interface Reply {
  status: number;
  body: unknown;
}

async function post(
  url: string,
  path: string,
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<Reply> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: JSON.stringify(body),
    signal: signal ?? null,
  });
  const payload: unknown = await response.json();
  return { status: response.status, body: payload };
}

/* The preview each apply is shown first, whose plan it quotes. */
const PREVIEWS = new Map([
  ["/api/apis/manage/apply", "/api/apis/manage/preview"],
  ["/api/apis/update/apply", "/api/apis/update/preview"],
  ["/api/apis/imports/remove", "/api/apis/imports/remove/preview"],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/* An apply's body once its preview was shown: the plan's digest quoted, as the UI sends it. */
async function quoted(
  url: string,
  route: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const preview = PREVIEWS.get(route);
  if (preview === undefined) return body;
  const reply = await post(url, preview, body);
  const plan = isRecord(reply.body) ? reply.body.plan : undefined;
  const digest = isRecord(plan) ? plan.digest : undefined;
  if (typeof digest !== "string")
    throw new Error(`${preview} gave no plan: ${JSON.stringify(reply.body)}`);
  return { ...body, planDigest: digest };
}

/* Studio started, and its first load of the config has an outcome: a display route waits for it. */
async function started(): Promise<string> {
  const url = await start();
  await post(url, "/api/apis/imports/check-all");
  return url;
}

/* The write the import wizard sends for `sourceName`, generated under `outputDir`. */
function writeFor(sourceName: string, outputDir = "src/api"): Record<string, unknown> {
  return {
    sourceName,
    spec: SPEC,
    options: { type: "openapi", outputDir, sourceName },
  };
}

/* Each route that writes an import's files, with a body that would write src/api/pets/index.ts. */
const ACT_ROUTES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["/api/apis/write", writeFor("pets")],
  ["/api/apis/manage/apply", ADD],
  ["/api/apis/update/apply", { name: "pets", newSpec: SPEC }],
];

async function refusals(
  url: string,
): Promise<Array<{ route: string; status: number; body: unknown }>> {
  const replies = [];
  for (const [route, body] of ACT_ROUTES)
    replies.push({ route, ...(await post(url, route, body)) });
  return replies;
}

describe("the imports routes", () => {
  it("load nothing when nothing changed", async () => {
    project(declaring("src/api"));
    const url = await started();
    const calls: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
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
      const sent = await quoted(url, route, body);
      const before = evaluations();
      const { status } = await post(url, route, sent);
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
    const body = await quoted(url, "/api/apis/manage/apply", ADD);
    const before = evaluations();

    const reply = await post(url, "/api/apis/manage/apply", body);

    expect(reply.status).toBe(200);
    expect(evaluations() - before).toBe(0);
    const generated = Object.keys(loadImportsState(root).imports.pets?.files ?? {});
    expect(generated.length).toBeGreaterThan(0);
    expect(reply.body).toMatchObject({ written: generated, removed: [] });
    for (const file of generated) {
      expect(file.startsWith("src/api/")).toBe(true);
      expect(existsSync(join(root, file))).toBe(true);
    }
  }, 15_000);

  it("a route that arrives during the first load waits for it, and the config is evaluated once in total", async () => {
    project(declaring("src/api", "await new Promise((resolve) => setTimeout(resolve, 500));\n"));
    const url = await start();

    const reply = await post(url, "/api/apis/manage/inventory", { name: "pets", newSpec: SPEC });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ specChanged: true });
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
  it("an import can be removed", async () => {
    project(BROKEN);
    writeProjectFile("src/api/pets/index.ts", signGeneratedFile("pets", GENERATED));
    saveImportsState(
      root,
      recordImport(loadImportsState(root), "pets", {
        specHash: "old",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        lastSyncedAt: "2026-01-01T00:00:00.000Z",
        dir: "src/api/pets",
        files: { "src/api/pets/index.ts": { sha256: bodyHash(GENERATED) } },
      }),
    );
    const url = await started();
    const body = await quoted(url, "/api/apis/imports/remove", { name: "pets" });

    const reply = await post(url, "/api/apis/imports/remove", body);

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ success: true, removed: ["src/api/pets/index.ts"] });
    expect(existsSync(join(root, "src/api/pets/index.ts"))).toBe(false);
    expect(loadImportsState(root).imports).toEqual({});
  }, 15_000);

  it("a display route serves the last good declarations", async () => {
    project(declaring("src/api"));
    const url = await started();
    writeProjectFile("courier.config.ts", BROKEN);

    const inventory = await post(url, "/api/apis/manage/inventory", {
      name: "pets",
      newSpec: SPEC,
    });

    expect(inventory.status).toBe(200);
    expect(inventory.body).toMatchObject({ specChanged: true });
    /* The first load, and the reload of the broken save the inventory caught up with. */
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
        body: {
          code: "CONFIG_MISSING",
          error: expect.stringContaining("Create courier.config.ts first"),
        },
      })),
    );
    expect(existsSync(join(root, "src/api"))).toBe(false);
  }, 15_000);

  it("refuse to write an import's files with 409 CONFIG_MISSING in a project that never had one", async () => {
    project(null);
    const url = await started();

    const replies = await refusals(url);

    expect(replies.map(({ status, body }) => ({ status, body }))).toEqual(
      ACT_ROUTES.map(() => ({
        status: 409,
        body: expect.objectContaining({ code: "CONFIG_MISSING" }),
      })),
    );
    expect(existsSync(join(root, "src/api"))).toBe(false);
  }, 15_000);
});

describe("a write for an import, after courier.config moved its output directory", () => {
  it("writes to the newly saved directory, and leaves a hand-written file there and the files it wrote before", async () => {
    project(declaring("src/old"));
    const url = await started();
    expect((await post(url, "/api/apis/write", writeFor("pets", "src/old"))).status).toBe(200);
    writeProjectFile("src/new/pets/stale.ts", GENERATED);
    writeProjectFile("courier.config.ts", declaring("src/new"));

    const reply = await post(url, "/api/apis/write", writeFor("pets", "src/new"));

    expect(reply.status).toBe(200);
    expect(existsSync(join(root, "src/new/pets/source.ts"))).toBe(true);
    expect(existsSync(join(root, "src/new/pets/stale.ts"))).toBe(true);
    expect(existsSync(join(root, "src/old/pets/source.ts"))).toBe(true);
    expect(reply.body).toMatchObject({
      leftBehind: expect.arrayContaining(["src/old/pets/source.ts"]),
    });
  }, 15_000);

  it("acts on the saved declaration when it waited for the imports lock while courier.config was saved", async () => {
    project(declaring("src/old"));
    const url = await started();
    writeProjectFile("src/old/pets/stale.ts", GENERATED);
    const gate = Promise.withResolvers<void>();
    const held = withImportsLock(() => gate.promise);

    const pending = post(url, "/api/apis/write", writeFor("pets", "src/new"));
    /* Long enough for a request that read the project before taking the lock to have read it. */
    await new Promise((resolve) => setTimeout(resolve, 300));
    writeProjectFile("courier.config.ts", declaring("src/new"));
    gate.resolve();
    await held;
    const reply = await pending;

    expect(reply.status).toBe(200);
    expect(existsSync(join(root, "src/new/pets/source.ts"))).toBe(true);
    expect(existsSync(join(root, "src/old/pets/stale.ts"))).toBe(true);
  }, 15_000);
});

describe("a write whose options contradict the import's declaration", () => {
  /* The declaration names no validation or grouping, so it generates with zod, by tag. */
  function writeWith(options: Record<string, unknown>): Record<string, unknown> {
    return {
      sourceName: "pets",
      spec: SPEC,
      options: { type: "openapi", sourceName: "pets", outputDir: "src/api", ...options },
    };
  }

  it("is refused 409, naming each option the declaration gives otherwise, before anything is written", async () => {
    project(declaring("src/api"));
    const url = await started();

    const reply = await post(
      url,
      "/api/apis/write",
      writeWith({ validation: "valibot", groupBy: "single" }),
    );

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({
      code: "DECLARATION_MISMATCH",
      error: expect.stringContaining(
        "validation zod and groupBy tag, but this write asks for validation valibot and groupBy single",
      ),
    });
    expect(existsSync(join(root, "src/api/pets/source.ts"))).toBe(false);
  }, 15_000);

  it("is written when the options are the declaration's, spelled out or left to their defaults", async () => {
    project(declaring("src/api"));
    const url = await started();

    const reply = await post(
      url,
      "/api/apis/write",
      writeWith({ validation: "zod", groupBy: "tag", generateTypes: true }),
    );

    expect(reply.status).toBe(200);
    expect(existsSync(join(root, "src/api/pets/source.ts"))).toBe(true);
  }, 15_000);
});

describe("a write whose options put a declared import in another directory", () => {
  /* The wizard's write for pets, generated under `outputDir`. */
  function writeUnder(outputDir: string): Record<string, unknown> {
    return {
      sourceName: "pets",
      spec: SPEC,
      options: { type: "openapi", sourceName: "pets", outputDir },
    };
  }

  it("is refused 409 before anything is written, so the declared directory keeps its files", async () => {
    project(declaring("lib/gen"));
    const url = await started();
    writeProjectFile("lib/gen/pets/helpers.ts", "export const help = 1;\n");

    const reply = await post(url, "/api/apis/write", writeUnder("src/api"));

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: "DECLARATION_MISMATCH" });
    expect(existsSync(join(root, "src/api/pets/source.ts"))).toBe(false);
    expect(existsSync(join(root, "lib/gen/pets/helpers.ts"))).toBe(true);
  }, 15_000);

  it("is refused when the directories differ only in letter case", async () => {
    project(declaring("src/Api"));
    const url = await started();

    const reply = await post(url, "/api/apis/write", writeUnder("src/api"));

    expect(reply.status).toBe(409);
    expect(existsSync(join(root, "src/api/pets/source.ts"))).toBe(false);
  }, 15_000);
});

describe("a declaration Studio refuses to lay out", () => {
  it("makes update/apply answer 400 and write nothing", async () => {
    project(declaring("node_modules/gen"));
    const url = await started();

    const reply = await post(url, "/api/apis/update/apply", { name: "pets", newSpec: SPEC });

    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({ code: "INVALID_IMPORT" });
    expect(existsSync(join(root, "node_modules/gen"))).toBe(false);
  }, 15_000);
});

describe("what a write for an import says courier.config must still declare", () => {
  const SOURCES_ONLY =
    'import "./count";\nexport default { sources: { api: { baseURL: "https://api.example" } } };\n';

  /* The write the import wizard sends for `name`, generated under src/api with the wizard's defaults. */
  function wizardWrite(
    name: string,
    choices: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      sourceName: name,
      spec: SPEC,
      specUrl: "https://specs.example/pets.json",
      importType: "url",
      options: {
        sourceName: name,
        outputDir: "src/api",
        validation: "zod",
        groupBy: "tag",
        generateTypes: true,
        generateSchemas: true,
        addAuthMiddleware: false,
        includeComments: true,
        generateClient: "direct",
        selectedEndpoints: { pets: ["listPets"] },
        ...choices,
      },
    };
  }

  it("names the source to import and list, and the imports entry, for an import the config does not declare", async () => {
    project(SOURCES_ONLY);
    const url = await started();

    const reply = await post(
      url,
      "/api/apis/write",
      wizardWrite("pets", { validation: "valibot" }),
    );

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      written: expect.arrayContaining(["src/api/pets/source.ts"]),
    });
    expect(reply.body).toHaveProperty("declaration", {
      configFile: "courier.config.ts",
      source: { importLine: 'import { pets } from "./src/api/pets/source";', entry: "pets," },
      importEntry: [
        '  "pets": {',
        '    importType: "url",',
        '    type: "openapi",',
        '    from: "https://specs.example/pets.json",',
        '    outputDir: "src/api",',
        '    sourceName: "pets",',
        '    validation: "valibot",',
        "  },",
      ].join("\n"),
    });
    expect(existsSync(join(root, "src/api/pets/source.ts"))).toBe(true);
  }, 15_000);

  it("names the source as the generator emits it, under the import's own name", async () => {
    project(SOURCES_ONLY);
    const url = await started();

    const reply = await post(url, "/api/apis/write", wizardWrite("pet-store"));

    expect(reply.status).toBe(200);
    expect(reply.body).toHaveProperty("declaration.source", {
      importLine: 'import { petStore } from "./src/api/pet-store/source";',
      entry: '"pet-store": petStore,',
    });
    expect(reply.body).toHaveProperty(
      "declaration.importEntry",
      expect.stringContaining('  "pet-store": {\n'),
    );
    expect(reply.body).toHaveProperty(
      "declaration.importEntry",
      expect.stringContaining('    sourceName: "petStore",\n'),
    );
  }, 15_000);

  it("names only the source while the config declares the import", async () => {
    project(declaring("src/api"));
    const url = await started();

    const reply = await post(url, "/api/apis/write", wizardWrite("pets"));

    expect(reply.status).toBe(200);
    expect(reply.body).toHaveProperty("declaration", {
      configFile: "courier.config.ts",
      source: { importLine: 'import { pets } from "./src/api/pets/source";', entry: "pets," },
    });
  }, 15_000);

  it("names nothing once the config declares the generated source and the import", async () => {
    const head = 'import { pets } from "./src/api/pets/source";\n';
    project(declaring("src/api", head).replace("sources: {", "sources: { pets,"));
    writeProjectFile(
      "src/api/pets/source.ts",
      signGeneratedFile("pets", 'export const pets = { baseURL: "https://pets.example" };\n'),
    );
    const url = await started();

    const reply = await post(url, "/api/apis/write", wizardWrite("pets"));

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      written: expect.arrayContaining(["src/api/pets/source.ts"]),
    });
    expect(reply.body).not.toHaveProperty("declaration");
  }, 15_000);

  it("counts the generated source as declared when the config imports it through another module", async () => {
    const head = 'import { pets } from "./src/api";\n';
    project(declaring("src/api", head).replace("sources: {", "sources: { pets,"));
    writeProjectFile("src/api/index.ts", 'export { pets } from "./pets/source";\n');
    writeProjectFile(
      "src/api/pets/source.ts",
      signGeneratedFile("pets", 'export const pets = { baseURL: "https://pets.example" };\n'),
    );
    const url = await started();

    const reply = await post(url, "/api/apis/write", wizardWrite("pets"));

    expect(reply.status).toBe(200);
    expect(reply.body).not.toHaveProperty("declaration");
  }, 15_000);

  it("refuses 409 NAME_TAKEN and writes nothing while sources names another API under it", async () => {
    project(
      declaring("src/api").replace(
        "sources: {",
        'sources: { pets: { baseURL: "https://pets.example" },',
      ),
    );
    const url = await started();

    const reply = await post(url, "/api/apis/write", wizardWrite("pets"));

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: "NAME_TAKEN" });
    expect(existsSync(join(root, "src/api/pets/source.ts"))).toBe(false);
  }, 15_000);

  it("counts the endpoints the selection left out alongside the imports entry", async () => {
    project(SOURCES_ONLY);
    const url = await started();

    const reply = await post(
      url,
      "/api/apis/write",
      wizardWrite("pets", { selectedEndpoints: { pets: [] } }),
    );

    expect(reply.status).toBe(200);
    expect(reply.body).toHaveProperty("declaration.leftOut", 1);
    expect(reply.body).toHaveProperty("declaration.importEntry");
  }, 15_000);
});

describe("the imports lists every UI is sent", () => {
  const sockets: Array<{ disconnect(): unknown }> = [];

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  interface Ui {
    events: Array<[string, unknown]>;
  }

  async function ui(url: string): Promise<Ui> {
    const socket = connect(`${url}/ui`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: { Origin: url },
    });
    sockets.push(socket);
    const events: Array<[string, unknown]> = [];
    socket.onAny((event: string, payload: unknown) => {
      events.push([event, payload]);
    });
    await until(() => events.some(([event]) => event === "config:status"));
    return { events };
  }

  async function until(condition: () => boolean, budgetMs = 5_000): Promise<void> {
    for (let waited = 0; waited < budgetMs && !condition(); waited += 25) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  /* The names in the latest registry:updated a UI got, after `since` events. */
  function namesSince(u: Ui, since: number): string[] | null {
    const lists = u.events.slice(since).filter(([event]) => event === "registry:updated");
    const latest = lists.at(-1)?.[1];
    if (
      typeof latest !== "object" ||
      latest === null ||
      !("sources" in latest) ||
      !Array.isArray(latest.sources)
    )
      return null;
    return latest.sources
      .map((source) =>
        typeof source === "object" && source !== null && "name" in source ? source.name : undefined,
      )
      .filter((name) => typeof name === "string")
      .sort();
  }

  function scansSince(u: Ui, since: number): number {
    return u.events.slice(since).filter(([event]) => event === "scan:sources").length;
  }

  function writeExtra(): Record<string, unknown> {
    return writeFor("extra", "src");
  }

  it("carry an import Studio wrote to every UI, and load nothing", async () => {
    project(declaring("src/api"));
    const url = await started();
    const [first, second] = [await ui(url), await ui(url)];
    const marks = [first.events.length, second.events.length];
    const loadsBefore = evaluations();

    const reply = await post(url, "/api/apis/write", writeExtra());
    /* The scan goes out as its own packet right after the registry: wait for both. */
    await until(
      () =>
        namesSince(first, marks[0] ?? 0) !== null &&
        namesSince(second, marks[1] ?? 0) !== null &&
        scansSince(first, marks[0] ?? 0) > 0,
    );

    expect(reply.status).toBe(200);
    expect(namesSince(first, marks[0] ?? 0)).toEqual(["extra", "pets"]);
    expect(namesSince(second, marks[1] ?? 0)).toEqual(["extra", "pets"]);
    expect(scansSince(first, marks[0] ?? 0)).toBe(1);
    expect(evaluations()).toBe(loadsBefore);
  }, 15_000);

  it("drop an import Studio removed from every UI", async () => {
    project(declaring("src/api"));
    const url = await started();
    await post(url, "/api/apis/write", writeExtra());
    const [first, second] = [await ui(url), await ui(url)];
    const marks = [first.events.length, second.events.length];
    const body = await quoted(url, "/api/apis/imports/remove", { name: "extra" });

    const reply = await post(url, "/api/apis/imports/remove", body);
    await until(
      () => namesSince(first, marks[0] ?? 0) !== null && namesSince(second, marks[1] ?? 0) !== null,
    );

    expect(reply.status).toBe(200);
    expect(namesSince(first, marks[0] ?? 0)).toEqual(["pets"]);
    expect(namesSince(second, marks[1] ?? 0)).toEqual(["pets"]);
  }, 15_000);

  it("carry what manage/apply changed to every UI", async () => {
    project(declaring("src/api"));
    const url = await started();
    const body = await quoted(url, "/api/apis/manage/apply", ADD);
    const first = await ui(url);
    const mark = first.events.length;

    const reply = await post(url, "/api/apis/manage/apply", body);
    await until(() => namesSince(first, mark) !== null && scansSince(first, mark) > 0);

    expect(reply.status).toBe(200);
    expect(namesSince(first, mark)).toEqual(["pets"]);
    expect(scansSince(first, mark)).toBe(1);
  }, 15_000);

  it("carry what update/apply changed to every UI", async () => {
    project(declaring("src/api"));
    const url = await started();
    const body = await quoted(url, "/api/apis/update/apply", { name: "pets", newSpec: SPEC });
    const first = await ui(url);
    const mark = first.events.length;

    const reply = await post(url, "/api/apis/update/apply", body);
    await until(() => namesSince(first, mark) !== null);

    expect(reply.status).toBe(200);
    expect(namesSince(first, mark)).toEqual(["pets"]);
  }, 15_000);

  it("reach a UI only through its socket: there is no route that lists them", async () => {
    project(declaring("src/api"));
    const url = await started();

    const response = await fetch(`${url}/api/apis/imports/list`, {
      method: "POST",
      headers: { origin: url },
    });

    expect(response.status).toBe(404);
  }, 15_000);
});

describe("the update checks of URL imports", () => {
  let specServer: Server | undefined;
  let specBase = "";

  beforeEach(async () => {
    const server = createServer((req, res) => {
      if (req.url === "/redirect-nowhere") {
        res.writeHead(302, { location: "http://[" }).end();
        return;
      }
      if (req.url === "/cut.json") {
        res.writeHead(200, { "content-type": "application/json", "content-length": "4096" });
        res.write('{"openapi":', () => res.socket?.destroy());
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      if (req.url === "/empty.json") res.end();
      else
        res.end(
          JSON.stringify({ openapi: "3.1.0", info: { title: "Pets", version: "1" }, paths: {} }),
        );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    specServer = server;
    specBase = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => specServer?.close(resolve));
    specServer = undefined;
  });

  /* A config that declares URL imports, by name, and names these private hosts. */
  function declaringUrls(urls: Record<string, string>, allowed: readonly string[] = []): string {
    const imports = Object.entries(urls)
      .map(
        ([name, from]) =>
          `${name}: { importType: "url", type: "openapi", from: "${from}", outputDir: "src/${name}" }`,
      )
      .join(", ");
    return `import "./count";\nexport default { sources: { api: { baseURL: "https://api.example" } }, studio: { allowedSpecHosts: ${JSON.stringify(allowed)} }, imports: { ${imports} } };\n`;
  }

  /* Studio started, and its first load of the config has an outcome, without fetching any import. */
  async function loaded(): Promise<string> {
    const url = await start();
    await post(url, "/api/apis/imports/check-updates", { name: "none" });
    return url;
  }

  it("check-updates answers 400 for a refused spec URL", async () => {
    project(declaringUrls({ pets: "http://10.0.0.7/spec.json" }));
    const url = await started();

    const reply = await post(url, "/api/apis/imports/check-updates", { name: "pets" });

    expect(reply.status).toBe(400);
    expect(String((reply.body as { error?: unknown }).error)).toContain(
      "Blocked request to private address: 10.0.0.7.",
    );
  }, 15_000);

  it("check-updates answers 502 for a spec URL that answers 200 with an empty body, naming it", async () => {
    project(declaringUrls({ empty: `${specBase}/empty.json` }));
    const url = await started();

    const reply = await post(
      url,
      "/api/apis/imports/check-updates",
      { name: "empty" },
      AbortSignal.timeout(5_000),
    );

    expect(reply).toEqual({
      status: 502,
      body: {
        code: "SPEC_UNREADABLE",
        error: expect.stringMatching(
          /empty\.json did not answer with a specification Studio can read: The specification is empty/,
        ),
      },
    });
  }, 15_000);

  it.each([
    [
      "redirects to something that is not a URL",
      "/redirect-nowhere",
      'redirects to "http://[", which is not a URL.',
    ],
    [
      "closes the connection partway through the body",
      "/cut.json",
      "closed the connection before the whole specification arrived (ECONNRESET).",
    ],
  ])(
    "check-updates answers 502 for a spec URL that %s, naming it",
    async (_what, path, reason) => {
      const from = `${specBase}${path}`;
      project(declaringUrls({ pets: from }));
      const url = await started();

      const reply = await post(
        url,
        "/api/apis/imports/check-updates",
        { name: "pets" },
        AbortSignal.timeout(5_000),
      );

      expect(reply).toEqual({
        status: 502,
        body: { error: `Failed to fetch spec from ${from}: ${from} ${reason}` },
      });
    },
    15_000,
  );

  it("check-all reports a body cut off as that import's own error, naming its URL", async () => {
    project(declaringUrls({ here: `${specBase}/spec.json`, cut: `${specBase}/cut.json` }));
    const url = await started();

    const reply = await post(url, "/api/apis/imports/check-all", {}, AbortSignal.timeout(5_000));

    expect(reply).toEqual({
      status: 200,
      body: {
        results: {
          here: { changed: true },
          cut: {
            changed: false,
            error: `${specBase}/cut.json closed the connection before the whole specification arrived (ECONNRESET).`,
          },
        },
      },
    });
  }, 15_000);

  it("check-updates refuses a private host 409 CONFIG_NOT_LOADING while courier.config does not load", async () => {
    project(declaringUrls({ pets: "http://10.0.0.7/spec.json" }, ["10.0.0.7"]));
    const url = await loaded();
    writeProjectFile("courier.config.ts", BROKEN);

    const reply = await post(url, "/api/apis/imports/check-updates", { name: "pets" });

    expect(reply).toEqual({
      status: 409,
      body: {
        code: "CONFIG_NOT_LOADING",
        error: expect.stringContaining("courier.config is broken on purpose"),
      },
    });
  }, 15_000);

  it("check-all loads nothing when nothing changed, and answers each import's refusal as its result", async () => {
    project(
      declaringUrls({
        here: `${specBase}/spec.json`,
        inside: "http://10.0.0.7/spec.json",
        beside: "http://[fd00::7]/spec.json",
      }),
    );
    const url = await started();
    const before = evaluations();

    const reply = await post(url, "/api/apis/imports/check-all");

    expect(evaluations() - before).toBe(0);
    expect(reply).toEqual({
      status: 200,
      body: {
        results: {
          here: { changed: true },
          inside: {
            changed: false,
            error: expect.stringContaining("Blocked request to private address: 10.0.0.7."),
          },
          beside: {
            changed: false,
            error: expect.stringContaining("Blocked request to private address: [fd00::7]."),
          },
        },
      },
    });
  }, 15_000);

  it("check-all refuses a private host the last good config named while courier.config does not load", async () => {
    project(declaringUrls({ inside: "http://10.0.0.7/spec.json" }, ["10.0.0.7"]));
    const url = await loaded();
    writeProjectFile("courier.config.ts", BROKEN);

    const reply = await post(url, "/api/apis/imports/check-all");

    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({
      results: {
        inside: {
          changed: false,
          error: expect.stringContaining("courier.config does not load right now"),
        },
      },
    });
  }, 15_000);
});

describe("a check of all imports", () => {
  type Handler = Parameters<RouteApp["post"]>[1];

  /* The check-all route over a project that runs these declarations, counting each read of it by budget. */
  function checkAll(declarations: Record<string, unknown>) {
    const view: FreshSnapshot = {
      revision: 1,
      starting: false,
      running: { config: { sources: {}, imports: declarations } } as never,
      loadedAt: 1,
      failure: null,
      settling: false,
    };
    const fresh = vi.fn(async (_budgetMs: number) => view);
    const project: ProjectImports = {
      snapshot: () => view,
      fresh,
      importsChanged: () => undefined,
    };
    let handler: Handler | undefined;
    const app: RouteApp = {
      post: (path, next) => {
        if (path === "/api/apis/imports/check-all") handler = next;
      },
    };
    registerRegistryRoutes(app, { project, projectRoot: root });
    const reply = new Promise<{ status: number; body: unknown }>((resolve) => {
      let status = 200;
      const res: JsonResponse = {
        status(code) {
          status = code;
          return res;
        },
        json(data) {
          resolve({ status, body: data });
        },
      };
      void handler?.({ body: {} }, res);
    });
    return { reply, fresh };
  }

  function urlImport(from: string): Record<string, unknown> {
    return { importType: "url", type: "openapi", from, outputDir: "src/api" };
  }

  it("reads the private hosts the project allows once for every import it checks", async () => {
    const { reply, fresh } = checkAll({
      a: urlImport("http://10.0.0.7/a.json"),
      b: urlImport("http://10.0.0.8/b.json"),
      c: urlImport("http://[fd00::9]/c.json"),
    });

    const { status } = await reply;

    expect(status).toBe(200);
    expect(fresh.mock.calls.filter(([budgetMs]) => budgetMs === ACT_BUDGET_MS)).toHaveLength(1);
  });

  it("reports an import named __proto__ like any other", async () => {
    const declarations: Record<string, unknown> = {};
    Object.defineProperty(declarations, "__proto__", {
      value: { importType: "file", type: "openapi", outputDir: "src/api" },
      enumerable: true,
    });
    const { reply } = checkAll(declarations);

    const { status, body } = await reply;
    const results: unknown =
      typeof body === "object" && body !== null && "results" in body ? body.results : null;

    expect(status).toBe(200);
    expect(
      results !== null && typeof results === "object" && Object.hasOwn(results, "__proto__"),
    ).toBe(true);
    expect(JSON.stringify(results)).toBe(
      '{"__proto__":{"changed":false,"unchecked":"A file import has no URL to check; upload its specification in Manage to compare."}}',
    );
  });
});
