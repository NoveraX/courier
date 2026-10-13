/**
 * An apply never removes a file that a file staying in the import's folder
 * imports. Importing again without a group whose file the user edited asks
 * before removing that file, and a file the user keeps keeps what it
 * imports — its schemas too — so the project still compiles rather than
 * stopping on "Cannot find module './schemas'".
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../../src/apis/parser/parse-spec";
import { createStudioServer } from "../../src/server/create-studio-server";
import type { StudioServer } from "../../src/server/types";
import { tokenHeader } from "../helpers/token-header";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Petstore", version: "1" },
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          tags: ["pets"],
          responses: {
            "200": {
              description: "ok",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } },
                },
              },
            },
          },
        },
      },
      "/store/orders": {
        get: {
          operationId: "listOrders",
          tags: ["store"],
          responses: {
            "200": {
              description: "ok",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Order" } },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Pet: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer" }, name: { type: "string" } },
        },
        Order: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer" }, total: { type: "number" } },
        },
      },
    },
  }),
);
const CONFIG =
  'export default { sources: { api: { baseURL: "https://api.example" } }, imports: { pets: { importType: "file", type: "openapi", outputDir: "src/api" } } };\n';
const OPTIONS = { type: "openapi", outputDir: "src/api", sourceName: "pets" };
const BARREL = "src/api/pets/index.ts";
const STORE = "src/api/pets/store/index.ts";

let root: string;
let studio: StudioServer | undefined;
let url: string;

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  /* Inside the repository's node_modules, so the generated code resolves the packages it imports. */
  const cache = join(import.meta.dirname, "../../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  root = mkdtempSync(join(cache, "keep-imported-"));
  put("courier.config.ts", CONFIG);
  url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

async function write(
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}/api/apis/write`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: JSON.stringify({
      sourceName: "pets",
      spec: SPEC,
      specUrl: "",
      importType: "file",
      ...body,
    }),
  });
  const payload: unknown = await response.json();
  return {
    status: response.status,
    body: typeof payload === "object" && payload !== null ? { ...payload } : {},
  };
}

function digestOf(reply: { body: Record<string, unknown> }): string {
  const plan = reply.body.plan;
  const digest =
    typeof plan === "object" && plan !== null && "digest" in plan ? plan.digest : undefined;
  if (typeof digest !== "string") throw new Error(`no plan in ${JSON.stringify(reply.body)}`);
  return digest;
}

function tsFilesUnder(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts"))
    .map((path) => join(root, dir, path));
}

function compileErrors(dir: string): string[] {
  const program = ts.createProgram(tsFilesUnder(dir), {
    strict: true,
    noEmit: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    types: [],
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (d) => `${d.file?.fileName ?? ""}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
    );
}

describe("importing again without a group whose edited file the user keeps", () => {
  it("keeps the files that file imports, and the project compiles", async () => {
    expect((await write({ options: OPTIONS })).status).toBe(200);
    put(BARREL, `${read(BARREL)}\n// my note\n`);
    put(
      STORE,
      read(STORE).replace("  endpoints: {\n", '  endpoints: {\n    mine: endpoint.get("/mine"),\n'),
    );
    const imported = (read(STORE).match(/from "(\.\/[^"]+)"/g) ?? []).map((from) =>
      from.slice(6, -1),
    );
    expect(imported).toContain("./schemas");
    const options = { ...OPTIONS, selectedEndpoints: { pets: ["listPets"] } };

    const asked = await write({ options });
    expect(asked.status).toBe(409);
    const applied = await write({ options, planDigest: digestOf(asked), confirm: [BARREL] });

    expect(applied.status).toBe(200);
    expect(existsSync(join(root, STORE))).toBe(true);
    expect(existsSync(join(root, "src/api/pets/store/schemas.ts"))).toBe(true);
    expect(applied.body.kept).toContainEqual({
      path: "src/api/pets/store/schemas.ts",
      reason: "imported",
    });
    expect(compileErrors("src/api/pets")).toEqual([]);
  }, 30_000);

  it("removes them with it once the user allows the removal", async () => {
    expect((await write({ options: OPTIONS })).status).toBe(200);
    put(
      STORE,
      read(STORE).replace("  endpoints: {\n", '  endpoints: {\n    mine: endpoint.get("/mine"),\n'),
    );
    const options = { ...OPTIONS, selectedEndpoints: { pets: ["listPets"] } };

    const asked = await write({ options });
    const applied = await write({ options, planDigest: digestOf(asked), confirm: [STORE] });

    expect(applied.status).toBe(200);
    expect(existsSync(join(root, "src/api/pets/store"))).toBe(false);
    expect(compileErrors("src/api/pets")).toEqual([]);
  }, 30_000);
});
