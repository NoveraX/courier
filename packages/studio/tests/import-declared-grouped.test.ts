/**
 * An import grouped by tag, declared in courier.config exactly as the wizard
 * says once it is written, is imported again and checked for updates like
 * any other: its source stays the `defineApi` the generator emits, and the
 * config keeps loading. The declaration says how many endpoints the Select
 * step left out, since the imports entry cannot keep that selection and an
 * update generates them.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerateOptions } from "../src/apis/generator/types";
import type { StudioServer } from "../src/server/types";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { loadCourierConfig } from "../src/server/config-loader";
import { createStudioServer } from "../src/server/create-studio-server";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");
const HAND_WRITTEN = '{ baseURL: "https://api.example" }';
const SOURCE_FILE = "src/api/petstore/source.ts";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Petstore", version: "1" },
    servers: [{ url: "https://petstore.example" }],
    paths: {
      "/pets": {
        get: { operationId: "listPets", tags: ["pets"], responses: { "200": { description: "ok" } } },
      },
      "/store/orders": {
        get: { operationId: "listOrders", tags: ["store"], responses: { "200": { description: "ok" } } },
      },
    },
  }),
);

/* The options the wizard sends by default, with only the pets group selected. */
const OPTIONS = {
  sourceName: "petstore",
  outputDir: "src/api",
  validation: "zod",
  groupBy: "tag",
  generateTypes: true,
  generateSchemas: true,
  addAuthMiddleware: false,
  includeComments: true,
  generateClient: "direct",
  selectedEndpoints: { pets: ["listPets"] },
} satisfies Omit<GenerateOptions, "type">;

const WRITE = {
  sourceName: "petstore",
  spec: SPEC,
  specUrl: "",
  importType: "raw",
  options: OPTIONS,
};

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-import-declared-")));
  symlinkSync(REPO_NODE_MODULES, join(root, "node_modules"), "dir");
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(text: string): void {
  writeFileSync(join(root, "courier.config.ts"), text);
}

function start(): Promise<string> {
  return new Promise<string>((ready, fail) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: ready,
      onError: fail,
    });
  });
}

async function post(url: string, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

interface Declaration {
  source: { importLine: string; entry: string };
  importEntry: string;
  leftOut: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function declarationOf(reply: unknown): Declaration {
  const declaration = isRecord(reply) ? reply.declaration : undefined;
  const source = isRecord(declaration) ? declaration.source : undefined;
  if (!isRecord(declaration) || !isRecord(source)) throw new Error(`no declaration in ${JSON.stringify(reply)}`);
  const { importEntry, leftOut } = declaration;
  const { importLine, entry } = source;
  if (typeof importEntry !== "string" || typeof leftOut !== "number") throw new Error("no imports entry");
  if (typeof importLine !== "string" || typeof entry !== "string") throw new Error("no source part");
  return { source: { importLine, entry }, importEntry, leftOut };
}

/* The config the user ends up with once they paste every part the wizard showed. */
function pasted({ source, importEntry }: Declaration): string {
  return [
    source.importLine,
    "export default {",
    `  sources: { api: ${HAND_WRITTEN}, ${source.entry} },`,
    "  imports: {",
    importEntry,
    "  },",
    "};",
    "",
  ].join("\n");
}

function digestOf(reply: unknown): string {
  const plan = isRecord(reply) ? reply.plan : undefined;
  const digest = isRecord(plan) ? plan.digest : undefined;
  if (typeof digest !== "string") throw new Error(`no plan in ${JSON.stringify(reply)}`);
  return digest;
}

describe("a grouped import declared as the wizard says", () => {
  it("keeps its source a defineApi through a second write and an update, and the config loading", async () => {
    writeConfig(`export default { sources: { api: ${HAND_WRITTEN} } };\n`);
    const url = await start();

    const first = await post(url, "/api/apis/write", WRITE);
    const declaration = declarationOf(first.body);
    expect(first.status).toBe(200);
    expect(declaration.leftOut).toBe(1);
    writeConfig(pasted(declaration));

    const second = await post(url, "/api/apis/write", WRITE);
    const update = await post(url, "/api/apis/update/preview", { name: "petstore", newSpec: SPEC });

    expect(second.status).toBe(200);
    expect(second.body).not.toHaveProperty("declaration");
    expect(readFileSync(join(root, SOURCE_FILE), "utf-8")).toContain(
      "export const petstore = defineApi({",
    );
    expect(update.status).toBe(200);
    const applied = await post(url, "/api/apis/update/apply", {
      name: "petstore",
      newSpec: SPEC,
      planDigest: digestOf(update.body),
    });
    expect(applied.status).toBe(200);
    expect(readFileSync(join(root, SOURCE_FILE), "utf-8")).toContain("export const petstore = defineApi({");
    /* The update generates the endpoint the Select step left out, as the declaration said. */
    expect(readFileSync(join(root, "src/api/petstore/store/index.ts"), "utf-8")).toContain("listOrders");
    const loaded = await loadCourierConfig(root);
    expect(Object.keys(loaded.config.sources ?? {})).toEqual(["api", "petstore"]);
    expect(Object.keys(loaded.config.imports ?? {})).toEqual(["petstore"]);
  }, 30_000);

  it("refuses to write an import whose name another API takes under sources", async () => {
    writeConfig(`export default { sources: { petstore: ${HAND_WRITTEN} } };\n`);
    const url = await start();

    const reply = await post(url, "/api/apis/write", WRITE);

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: "NAME_TAKEN" });
    /* Written anyway, the import would make Studio take the other API for it. */
    expect(existsSync(join(root, SOURCE_FILE))).toBe(false);
  }, 30_000);
});
