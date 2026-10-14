/**
 * `courier-studio import`, run as a person or a CI job runs it: the plan
 * shown first, nothing written without consent where no one can answer, the
 * files written and recorded as Import API writes them and the import
 * declared in courier.config.ts, which then loads — the endpoints
 * `--include` and `--exclude` pick, recorded for updates; a file you changed
 * kept until `--confirm` allows replacing it; a URL on this machine, standard
 * input, `--no-declare`, a config that takes its `sources` from a module of
 * the project, and a project with no config yet.
 */
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PACKAGE = resolve(import.meta.dirname, "../..");
const CLI = join(PACKAGE, "src/cli.ts");

function petStore(extra: Record<string, unknown> = {}): string {
  const ok = (schema: unknown) => ({
    description: "ok",
    content: { "application/json": { schema } },
  });
  const pet = { $ref: "#/components/schemas/Pet" };
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Pet Store", version: "1.0.0" },
    servers: [{ url: "https://petstore.example/v1" }],
    paths: {
      "/pets": {
        get: {
          tags: ["pets"],
          operationId: "listPets",
          responses: { 200: ok({ type: "array", items: pet }) },
        },
        post: {
          tags: ["pets"],
          operationId: "createPet",
          requestBody: { content: { "application/json": { schema: pet } } },
          responses: { 201: ok(pet) },
        },
      },
      "/pets/{petId}": {
        get: {
          tags: ["pets"],
          operationId: "getPet",
          parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: ok(pet) },
        },
      },
      "/store/inventory": {
        get: {
          tags: ["store"],
          operationId: "getInventory",
          responses: { 200: ok({ type: "object" }) },
        },
      },
      ...extra,
    },
    components: {
      schemas: {
        Pet: {
          type: "object",
          required: ["name"],
          properties: { id: { type: "string" }, name: { type: "string" } },
        },
      },
    },
  });
}

const MINIMAL =
  'import { defineConfig } from "@noverax/courier/config";\nexport default defineConfig({ sources: {} });\n';

/* The config as the guides lay a project out: the list of APIs in a module of its own. */
const FROM_MODULE =
  'import { defineConfig } from "@noverax/courier/config";\nimport { sources } from "./lib/sources";\nexport default defineConfig({ sources });\n';

let dir: string;
let spec: string;

interface Run {
  status: number | null;
  stdout: string;
  output: string;
}

function studioImport(args: readonly string[], input?: string): Promise<Run> {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", CLI, "import", ...args, "--cwd", dir],
      {
        cwd: PACKAGE,
        env: { ...process.env, NO_COLOR: "1", TSX_TSCONFIG_PATH: join(PACKAGE, "tsconfig.json") },
      },
    );
    let stdout = "";
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk;
      output += chunk;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk;
    });
    child.stdin.end(input ?? "");
    child.on("close", (status) => done({ status, stdout, output }));
  });
}

const read = (path: string) => readFileSync(join(dir, path), "utf8");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-import-"));
  symlinkSync(resolve(PACKAGE, "../../node_modules"), join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "shop", type: "module" }));
  writeFileSync(join(dir, "courier.config.ts"), MINIMAL);
  spec = join(dir, "petstore.json");
  writeFileSync(spec, petStore());
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("courier-studio import", { timeout: 60_000 }, () => {
  it("shows the plan and the change to the config with --dry-run, and writes nothing", async () => {
    const run = await studioImport([spec, "--dry-run"]);

    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain(
      `Import petStore from ${spec}: OpenAPI 3, 4 endpoints in 2 groups`,
    );
    expect(run.stdout).toContain("  + source.ts");
    expect(run.stdout).toContain('  import { petStore } from "./src/api/pet-store/source";');
    expect(existsSync(join(dir, "src"))).toBe(false);
    expect(read("courier.config.ts")).toBe(MINIMAL);
  });

  it("writes nothing where no one can answer and --yes was not given", async () => {
    const run = await studioImport([spec]);

    expect(run.status).toBe(1);
    expect(run.stdout).toContain("Nothing was written: run it again with --yes to write it");
    expect(existsSync(join(dir, "src"))).toBe(false);
  });

  it("writes and records the files, declares the import, and finds nothing to do the next time", async () => {
    const run = await studioImport([spec, "--yes"]);
    const again = await studioImport([spec, "--dry-run"]);

    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain("Wrote 5 files in src/api/pet-store.");
    expect(run.stdout).toContain("Declared petStore in courier.config.ts.");
    expect(run.stdout).toContain('Call it: import { petStoreApi } from "./src/api/pet-store"');
    expect(run.output).not.toContain("INFO");
    expect(read("courier.config.ts")).toContain(
      'import { petStore } from "./src/api/pet-store/source";',
    );
    expect(JSON.parse(read(".courier/imports-state.json")).imports.petStore).toBeDefined();
    expect(again.status, again.output).toBe(0);
    expect(again.stdout).toContain("  = source.ts  unchanged");
    expect(again.stdout).not.toContain("Then courier.config.ts declares it");
  });

  it("writes the routes module a proxy caller takes its routes from, once the import is declared", async () => {
    const run = await studioImport([spec, "--yes", "--client", "proxy"]);

    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain(
      "Wrote courier.routes.ts: 4 endpoints a page may call, of petStore",
    );
    expect(read("courier.routes.ts")).toContain("export const petStoreRoutes");
    expect(read("src/api/pet-store/source.ts")).toContain("  expose: true,");
    expect(read("src/api/pet-store/proxy.ts")).toContain(
      'import { petStoreRoutes } from "../../../courier.routes";',
    );
  });

  it("imports only the endpoints --include and --exclude pick, records them, and refuses others later", async () => {
    const run = await studioImport([
      spec,
      "--yes",
      "--include",
      "tag:pets",
      "--exclude",
      "op:createPet",
    ]);
    const other = await studioImport([spec, "--dry-run", "--include", "tag:store"]);

    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain("4 endpoints in 2 groups, 2 of them picked");
    expect(read("src/api/pet-store/pets/index.ts")).toMatch(/listPets[\s\S]*getPet/);
    expect(read("src/api/pet-store/pets/index.ts")).not.toContain("createPet");
    expect(existsSync(join(dir, "src/api/pet-store/store"))).toBe(false);
    expect(read("courier.config.ts")).toContain('include: { tags: ["pets"] }');
    expect(read("courier.config.ts")).toContain('exclude: { operationIds: ["createPet"] }');
    expect(other.status).toBe(1);
    expect(other.output).toContain("declares petStore with another include");
  });

  it("keeps a file you changed until --confirm allows replacing it, and keeps a copy", async () => {
    await studioImport([spec, "--yes"]);
    appendFileSync(join(dir, "src/api/pet-store/index.ts"), "// mine\n");
    writeFileSync(
      spec,
      petStore({
        "/store/orders": {
          get: {
            tags: ["store"],
            operationId: "listOrders",
            responses: { 200: { description: "ok" } },
          },
        },
      }),
    );

    const kept = await studioImport([spec, "--yes"]);
    const index = read("src/api/pet-store/index.ts");
    const allowed = await studioImport([spec, "--yes", "--confirm", "src/api/pet-store/index.ts"]);

    expect(kept.stdout).toContain("replace src/api/pet-store/index.ts: you changed it");
    expect(kept.stdout).toContain(
      "Kept src/api/pet-store/index.ts as it is; allow the change with --confirm src/api/pet-store/index.ts",
    );
    expect(index).toContain("// mine");
    expect(read("src/api/pet-store/store/index.ts")).toContain("listOrders");
    expect(allowed.status, allowed.output).toBe(0);
    expect(read("src/api/pet-store/index.ts")).not.toContain("// mine");
    expect(readdirSync(join(dir, ".courier/backups")).length).toBeGreaterThan(0);
  });

  it("reads a specification from a URL on this machine and declares the import with its address", async () => {
    const server: Server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(petStore());
    });
    await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
    const address = server.address();
    const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/openapi.json`;

    const run = await studioImport([url, "--yes"]).finally(() => server.close());

    expect(run.status, run.output).toBe(0);
    expect(read("courier.config.ts")).toContain(`from: "${url}"`);
  });

  it("reads standard input for -, and with --no-declare only writes the files and gives the lines to add", async () => {
    const run = await studioImport(["-", "--yes", "--no-declare", "--name", "pets"], petStore());

    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain("Import pets from standard input");
    expect(run.stdout).toContain("Add these lines to courier.config.ts:");
    expect(run.stdout).toContain('importType: "raw"');
    expect(existsSync(join(dir, "src/api/pets/source.ts"))).toBe(true);
    expect(read("courier.config.ts")).toBe(MINIMAL);
  });

  it("lists the source in the module the config takes its sources from, and declares the import in the config", async () => {
    writeFileSync(join(dir, "courier.config.ts"), FROM_MODULE);
    mkdirSync(join(dir, "lib"));
    writeFileSync(join(dir, "lib", "sources.ts"), "export const sources = {};\n");

    const dry = await studioImport([spec, "--dry-run"]);
    const run = await studioImport([spec, "--yes"]);

    expect(dry.stdout).toContain("Then lib/sources.ts and courier.config.ts declare it:");
    expect(dry.stdout).toContain(
      '  in lib/sources.ts:\n  import { petStore } from "../src/api/pet-store/source";',
    );
    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain("Declared petStore in lib/sources.ts and courier.config.ts.");
    expect(read("lib/sources.ts")).toBe(
      'import { petStore } from "../src/api/pet-store/source";\n\nexport const sources = { petStore };\n',
    );
    expect(read("courier.config.ts")).toContain("defineConfig({ sources, imports: {");
    expect(read("courier.config.ts")).not.toContain("pet-store/source");
  });

  it("with --no-declare gives each line under the file it goes in", async () => {
    writeFileSync(join(dir, "courier.config.ts"), FROM_MODULE);
    mkdirSync(join(dir, "lib"));
    writeFileSync(join(dir, "lib", "sources.ts"), "export const sources = {};\n");

    const run = await studioImport([spec, "--yes", "--no-declare"]);

    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain("Add these lines to lib/sources.ts and courier.config.ts:");
    expect(run.stdout).toContain("  in lib/sources.ts:");
    expect(run.stdout).toContain("  in courier.config.ts:\n  under imports:");
    expect(read("lib/sources.ts")).toBe("export const sources = {};\n");
  });

  it("says how to start a project with no courier.config.ts, and refuses an option it does not take", async () => {
    const unknown = await studioImport([spec, "--dry-run", "--validation", "yup"]);
    rmSync(join(dir, "courier.config.ts"));
    const missing = await studioImport([spec, "--dry-run"]);

    expect(unknown.status).toBe(1);
    expect(unknown.output).toContain('--validation takes zod, valibot, arktype, none, not "yup"');
    expect(missing.status).toBe(1);
    expect(missing.stdout).toContain("There is no courier.config.ts in");
    expect(missing.stdout).toContain(MINIMAL.trim());
  });
});
