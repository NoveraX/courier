/**
 * Checking a declared import for updates, and updating it, over Studio's
 * own API, as its entry under `imports` says: fetched with its `auth`,
 * refused when its hash is not the one `pinHash` names, and generated from
 * what its `transform` makes of the spec and its `include` and `exclude`
 * keep. The update check sent no auth and compared no hash, and the
 * generator read neither the transform nor the selectors.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-update-check-")));
  mkdirSync(join(root, "src"));
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function start(config: string): Promise<string> {
  writeFileSync(join(root, "courier.config.ts"), config);
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
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

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

describe("an import declared with a field of the wrong kind", () => {
  const CONFIG = `export default {
  sources: { api: { baseURL: "https://api.example" } },
  imports: { x: { importType: "url", type: "openapi", from: 5, outputDir: "src/api" } },
};\n`;

  it("fails the config load, naming the field, instead of reaching the routes", async () => {
    const url = await start(CONFIG);

    const checked = await post(url, "/api/apis/imports/check-updates", { name: "x" });

    expect(checked.status).not.toBe(500);
    expect(JSON.stringify(checked.body)).toContain("courier.config.imports.x.from is a number, not an http or https URL");
  });
});

/* A spec server that says what each request carried. */
interface SpecServer {
  url: string;
  seen: Array<Record<string, string | string[] | undefined>>;
  close(): Promise<void>;
}

const PRIVATE_SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Petstore", version: "1" },
  paths: {
    "/pet/{petId}": {
      get: {
        operationId: "getPetById",
        tags: ["pet"],
        parameters: [{ name: "petId", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/pet": { post: { operationId: "addPet", tags: ["pet"], responses: { "200": { description: "ok" } } } },
    "/store/inventory": { get: { operationId: "getInventory", tags: ["store"], responses: { "200": { description: "ok" } } } },
    "/store/order": { post: { operationId: "placeOrder", tags: ["store"], responses: { "200": { description: "ok" } } } },
    "/extra": { get: { operationId: "extraThing", tags: ["extra"], responses: { "200": { description: "ok" } } } },
  },
});

async function specServer(handle: (req: IncomingMessage, res: ServerResponse) => void): Promise<SpecServer> {
  const seen: SpecServer["seen"] = [];
  const server = createHttpServer((req, res) => {
    seen.push({ ...req.headers });
    handle(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("not listening on TCP");
  return {
    url: `http://127.0.0.1:${address.port}`,
    seen,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/* Answers only a request that carries the token. */
function privateSpec(req: IncomingMessage, res: ServerResponse): void {
  if (req.headers.authorization !== "Bearer SECRET-TOKEN") {
    res.writeHead(401).end();
    return;
  }
  res.writeHead(200, { "content-type": "application/json" }).end(PRIVATE_SPEC);
}

function declared(from: string, extra = ""): string {
  return `export default {
  sources: { api: { baseURL: "https://api.example" } },
  imports: {
    petstore: {
      importType: "url",
      type: "openapi",
      from: ${JSON.stringify(from)},
      outputDir: "src/api",
      auth: { type: "bearer", token: "SECRET-TOKEN" },
      include: { operationIds: ["getPetById", "getInventory"] },
      exclude: { tags: ["store"] },
      transform: (spec) => ({ ...spec, baseURL: "https://transformed.example" }),${extra}
    },
  },
};\n`;
}

function generatedCode(): string {
  const dir = join(root, "src/api/petstore");
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts"))
    .map((path) => readFileSync(join(dir, path), "utf8"))
    .join("\n");
}

describe("checking every import for updates", () => {
  const servers: SpecServer[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
  });

  it("reports an import with no URL as not checked, saying why, rather than up to date", async () => {
    const url = await start(`export default {
  sources: { api: { baseURL: "https://api.example" } },
  imports: { petsFile: { importType: "file", type: "openapi", outputDir: "src/api" } },
};\n`);

    const all = await post(url, "/api/apis/imports/check-all", {});

    expect(all.status).toBe(200);
    expect(field(field(all.body, "results"), "petsFile")).toEqual({
      changed: false,
      unchecked: "A file import has no URL to check; upload its specification in Manage to compare.",
    });
  });

  it("answers 502 naming the URL when it serves something that is not a specification", async () => {
    const page = await specServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>Not here</title>");
    });
    servers.push(page);
    const url = await start(`export default {
  sources: { api: { baseURL: "https://api.example" } },
  imports: { pets: { importType: "url", type: "openapi", from: "${page.url}/notjson", outputDir: "src/api" } },
};\n`);

    const checked = await post(url, "/api/apis/imports/check-updates", { name: "pets" });
    const all = await post(url, "/api/apis/imports/check-all", {});

    expect(checked.status).toBe(502);
    expect(field(checked.body, "code")).toBe("SPEC_UNREADABLE");
    expect(field(checked.body, "error")).toContain(`${page.url}/notjson did not answer with a specification`);
    expect(field(field(field(all.body, "results"), "pets"), "error")).toContain("did not answer with a specification");
  });
});

describe("updating a declared import as its entry says", () => {
  const servers: SpecServer[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
  });

  it("fetches with its auth, and generates only what include and exclude keep, transformed", async () => {
    const spec = await specServer(privateSpec);
    servers.push(spec);
    const url = await start(declared(`${spec.url}/private/spec.json`));

    const checked = await post(url, "/api/apis/imports/check-updates", { name: "petstore" });
    expect(checked.status).toBe(200);
    expect(field(checked.body, "changed")).toBe(true);
    expect(spec.seen.at(-1)?.authorization).toBe("Bearer SECRET-TOKEN");

    const newSpec = field(checked.body, "newSpec");
    const preview = await post(url, "/api/apis/update/preview", { name: "petstore", newSpec });
    expect(preview.status).toBe(200);
    const planDigest = field(field(preview.body, "plan"), "digest");
    const applied = await post(url, "/api/apis/update/apply", { name: "petstore", newSpec, planDigest });
    expect(applied.status).toBe(200);

    const code = generatedCode();
    expect(code).toContain("getPetById");
    for (const left of ["addPet", "getInventory", "placeOrder", "extraThing"]) expect(code).not.toContain(left);
    expect(code).toContain("https://transformed.example");
  });

  it("offers to add only the endpoints include and exclude keep", async () => {
    const spec = await specServer(privateSpec);
    servers.push(spec);
    const url = await start(declared(`${spec.url}/private/spec.json`));

    const inventory = await post(url, "/api/apis/manage/inventory", { name: "petstore", newSpec: parseSpec(PRIVATE_SPEC) });

    expect(inventory.status).toBe(200);
    const listed = JSON.stringify(inventory.body);
    expect(listed).toContain("getPetById");
    for (const left of ["addPet", "getInventory", "placeOrder", "extraThing"]) expect(listed).not.toContain(left);
  });

  it("sends the auth to the spec's own origin only, not to where it redirects", async () => {
    const elsewhere = await specServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" }).end(PRIVATE_SPEC);
    });
    const origin = await specServer((req, res) => {
      if (req.headers.authorization !== "Bearer SECRET-TOKEN") res.writeHead(401).end();
      else res.writeHead(302, { location: `${elsewhere.url}/spec.json` }).end();
    });
    servers.push(elsewhere, origin);
    const url = await start(declared(`${origin.url}/spec.json`));

    const checked = await post(url, "/api/apis/imports/check-updates", { name: "petstore" });

    expect(checked.status).toBe(200);
    expect(elsewhere.seen).toHaveLength(1);
    expect(elsewhere.seen[0]?.authorization).toBeUndefined();
  });

  it("refuses a spec whose hash is not the one pinned", async () => {
    const spec = await specServer(privateSpec);
    servers.push(spec);
    const url = await start(declared(`${spec.url}/private/spec.json`, `\n      pinHash: "${"0".repeat(32)}",`));

    const checked = await post(url, "/api/apis/imports/check-updates", { name: "petstore" });
    const all = await post(url, "/api/apis/imports/check-all", {});
    const preview = await post(url, "/api/apis/update/preview", { name: "petstore", newSpec: parseSpec(PRIVATE_SPEC) });

    expect(checked.status).toBe(409);
    expect(field(checked.body, "code")).toBe("SPEC_PIN_MISMATCH");
    expect(JSON.stringify(field(all.body, "results"))).toContain("pinHash");
    expect(preview.status).toBe(409);
    expect(field(preview.body, "code")).toBe("SPEC_PIN_MISMATCH");
  });

  it("names the import when its transform fails", async () => {
    const spec = await specServer(privateSpec);
    servers.push(spec);
    const failing = declared(`${spec.url}/private/spec.json`).replace(
      '(spec) => ({ ...spec, baseURL: "https://transformed.example" })',
      '() => { throw new Error("no such tag"); }',
    );
    const url = await start(failing);

    const preview = await post(url, "/api/apis/update/preview", { name: "petstore", newSpec: parseSpec(PRIVATE_SPEC) });

    expect(preview.status).toBe(400);
    expect(field(preview.body, "code")).toBe("IMPORT_TRANSFORM_FAILED");
    expect(field(preview.body, "error")).toContain("no such tag");
  });
});
