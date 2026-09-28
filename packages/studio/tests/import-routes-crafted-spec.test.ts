/**
 * A write carries the spec as the UI parsed it, so every name in it — a
 * group, an endpoint, a schema, a tag, a path — comes from the request.
 * Whatever those names say, Studio writes only inside the import's own
 * folder, or refuses the request with 400 and changes nothing.
 */
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedEndpoint, ParsedGroup, ParsedSpec } from "../src/apis/parser/types";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const CONFIG = 'export default { sources: { api: { baseURL: "https://api.example" } } };\n';
const IMPORT_DIR = "src/api/pets";

let scratch: string;
let root: string;
let studio: StudioServer | undefined;
let url: string;

function start(): Promise<string> {
  return new Promise((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  return { status: response.status, body: typeof payload === "object" && payload !== null ? { ...payload } : {} };
}

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (absolute: string, relative: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const path = join(absolute, entry.name);
      const shown = relative === "" ? entry.name : `${relative}/${entry.name}`;
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) out[shown] = `link:${readlinkSync(path)}`;
      else if (stats.isDirectory()) {
        out[shown] = "dir";
        walk(path, shown);
      } else if (stats.isFile()) {
        out[shown] = `file:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
      } else out[shown] = "other";
    }
  };
  walk(scratch, "");
  return out;
}

/* Paths added or changed since `before`, other than the import's folder, `.courier` and the folders above the import's. */
function changedOutsideTheImport(before: Record<string, string>): string[] {
  const after = snapshot();
  const allowed = (path: string): boolean =>
    path === "proj/src" ||
    path === "proj/src/api" ||
    path === `proj/${IMPORT_DIR}` ||
    path.startsWith(`proj/${IMPORT_DIR}/`) ||
    path === "proj/.courier" ||
    path.startsWith("proj/.courier/");
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((path) => before[path] !== after[path] && !allowed(path)).sort();
}

function endpoint(overrides: Partial<ParsedEndpoint> = {}): ParsedEndpoint {
  return {
    name: "listPets",
    operationId: "listPets",
    httpMethod: "get",
    path: "/",
    fullPath: "/pets",
    description: "",
    secured: false,
    requestBody: null,
    parameters: [],
    responseSchema: null,
    tags: ["pets"],
    ...overrides,
  };
}

function group(name: string, endpoints: ParsedEndpoint[] = [endpoint()]): ParsedGroup {
  return { name, description: "", prefix: "/pets", endpoints };
}

function spec(groups: ParsedGroup[], schemas: ParsedSpec["schemas"] = {}): ParsedSpec {
  return {
    title: "Pets",
    version: "1",
    description: "",
    baseURL: "https://api.example",
    format: "openapi3",
    groups,
    schemas,
    securitySchemes: [],
    skipped: [],
  };
}

function withSchema(schemaName: string): ParsedSpec {
  const ref = { name: schemaName, type: "ref" as const, refName: schemaName };
  const schema = { name: schemaName, type: "object" as const, properties: { id: { type: "string", required: true } } };
  return spec([group("pets", [endpoint({ responseSchema: ref })])], { [schemaName]: schema });
}

const HUGE = "x".repeat(5000);

const CRAFTED: Array<[string, ParsedSpec, "tag" | "path" | "single"]> = [
  ["group ../x", spec([group("../x")]), "tag"],
  ["group ../../../outside", spec([group("../../../outside")]), "tag"],
  ["group a/b", spec([group("a/b")]), "tag"],
  ["group a\\b", spec([group("a\\b")]), "tag"],
  ["group /abs", spec([group("/abs")]), "tag"],
  ["group C:", spec([group("C:")]), "tag"],
  ["group .", spec([group(".")]), "tag"],
  ["group ..", spec([group("..")]), "tag"],
  ["group empty", spec([group("")]), "tag"],
  ["group space", spec([group(" ")]), "tag"],
  ["group __proto__", spec([group("__proto__")]), "tag"],
  ["group constructor", spec([group("constructor")]), "tag"],
  ["group prototype", spec([group("prototype")]), "tag"],
  ["group node_modules", spec([group("node_modules")]), "tag"],
  ["group .git", spec([group(".git")]), "tag"],
  ["group con", spec([group("con")]), "tag"],
  ["group huge", spec([group(HUGE)]), "tag"],
  ["groups Pets and pets", spec([group("Pets"), group("pets", [endpoint({ name: "createPet", httpMethod: "post" })])]), "tag"],
  ["group pets twice", spec([group("pets"), group("pets", [endpoint({ name: "createPet", httpMethod: "post" })])]), "tag"],
  ["endpoint ../x", spec([group("pets", [endpoint({ name: "../x" })])]), "tag"],
  ["endpoint __proto__", spec([group("pets", [endpoint({ name: "__proto__" })])]), "tag"],
  ["endpoint constructor", spec([group("pets", [endpoint({ name: "constructor" })])]), "tag"],
  ["endpoint empty", spec([group("pets", [endpoint({ name: "" })])]), "tag"],
  ["endpoint huge", spec([group("pets", [endpoint({ name: HUGE })])]), "tag"],
  ["operationId ../x", spec([group("pets", [endpoint({ operationId: "../../x" })])]), "tag"],
  ["tag ../x", spec([group("pets", [endpoint({ tags: ["../../x", "__proto__"] })])]), "tag"],
  ["schema ../x", withSchema("../x"), "tag"],
  ["schema __proto__", withSchema("__proto__"), "tag"],
  ["schema constructor", withSchema("constructor"), "tag"],
  ["schema empty", withSchema(""), "tag"],
  ["schema huge", withSchema(HUGE), "tag"],
  ["path grouping, climbing path", spec([group("pets", [endpoint({ fullPath: "/../../outside/{id}" })])]), "path"],
  ["path grouping, __proto__ segment", spec([group("pets", [endpoint({ fullPath: "/__proto__/x" })])]), "path"],
  ["path grouping, huge segment", spec([group("pets", [endpoint({ fullPath: `/${HUGE}` })])]), "path"],
  ["flat, climbing group", spec([group("../../outside")]), "single"],
];

describe("POST /api/apis/write with a crafted parsed spec", () => {
  beforeAll(async () => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-b2-spec-")));
    root = join(scratch, "proj");
    mkdirSync(join(scratch, "outside"));
    writeFileSync(join(scratch, "outside/keep.ts"), "keep\n");
    mkdirSync(dirname(join(root, "courier.config.ts")), { recursive: true });
    writeFileSync(join(root, "courier.config.ts"), CONFIG);
    url = await start();
  }, 30_000);
  afterAll(async () => {
    await studio?.close();
    studio = undefined;
    rmSync(scratch, { recursive: true, force: true });
  });
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(async () => {
    vi.restoreAllMocks();
    /* Each case starts from no import: forget what the previous one wrote. */
    rmSync(join(root, "src"), { recursive: true, force: true });
    rmSync(join(root, ".courier"), { recursive: true, force: true });
  });

  it.each(CRAFTED)("%s → 400, or files only in src/api/pets/", async (_label, crafted, groupBy) => {
    const before = snapshot();

    const reply = await post("/api/apis/write", {
      sourceName: "pets",
      spec: crafted,
      options: { type: "openapi", outputDir: "src/api", sourceName: "pets", groupBy },
    });

    expect.soft([200, 400], JSON.stringify(reply.body).slice(0, 300)).toContain(reply.status);
    expect.soft(changedOutsideTheImport(before)).toEqual([]);
    if (reply.status !== 200) return;
    const written = Array.isArray(reply.body.written) ? reply.body.written.map(String) : [];
    expect.soft(written.filter((path) => !path.startsWith(`${IMPORT_DIR}/`))).toEqual([]);
    const state = JSON.parse(readFileSync(join(root, ".courier/imports-state.json"), "utf8")) as {
      imports: Record<string, { dir: string; files: Record<string, unknown> }>;
    };
    expect.soft(state.imports.pets?.dir).toBe(IMPORT_DIR);
    expect.soft(Object.keys(state.imports.pets?.files ?? {}).filter((path) => !path.startsWith(`${IMPORT_DIR}/`))).toEqual([]);
  }, 20_000);
});
