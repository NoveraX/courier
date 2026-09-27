/**
 * The routes that write and remove an import's files, through a real Studio
 * server: Studio writes only what it generated, never through a link, never
 * over a file that is not its own without the user's consent, keeps the
 * user's edits to endpoints, and undoes a write a crash cut short.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { saveJournal } from "../src/server/import-files/apply-journal";
import { bodyHash } from "../src/server/import-files/body-hash";
import { readGeneratedFile } from "../src/server/import-files/generated-header";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

const IS_WINDOWS = process.platform === "win32";
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Pets", version: "1" },
    paths: {
      "/pets": {
        get: { operationId: "listPets", tags: ["pets"], responses: { "200": { description: "ok" } } },
        post: { operationId: "createPet", tags: ["pets"], responses: { "200": { description: "ok" } } },
      },
    },
  }),
);
const CONFIG =
  'export default { sources: { api: { baseURL: "https://api.example" } }, imports: { pets: { importType: "file", type: "openapi", outputDir: "src/api" } } };\n';
const WRITE = { sourceName: "pets", spec: SPEC, options: { type: "openapi", outputDir: "src/api", sourceName: "pets" } };
const GROUP_FILE = "src/api/pets/pets/index.ts";

let scratch: string;
let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-import-files-routes-")));
  root = join(scratch, "proj");
  put("courier.config.ts", CONFIG);
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(scratch, { recursive: true, force: true });
});

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function start(): Promise<string> {
  return new Promise((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
}

async function post(url: string, path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  return { status: response.status, body: typeof payload === "object" && payload !== null ? { ...payload } : {} };
}

function planOf(reply: { body: Record<string, unknown> }): { digest: string; pending: Array<{ path: string }> } {
  const plan = reply.body.plan;
  if (typeof plan !== "object" || plan === null || !("digest" in plan) || typeof plan.digest !== "string") {
    throw new Error(`no plan in ${JSON.stringify(reply.body)}`);
  }
  const pending = "pending" in plan && Array.isArray(plan.pending) ? plan.pending : [];
  return { digest: plan.digest, pending };
}

describe("writing an import's files", () => {
  it("keeps a hand-written file in the import's directory through a rewrite", async () => {
    const url = await start();
    expect((await post(url, "/api/apis/write", WRITE)).status).toBe(200);
    put("src/api/pets/helpers.ts", "export const help = 1;\n");

    const again = await post(url, "/api/apis/write", WRITE);

    expect(again.status).toBe(200);
    expect(read("src/api/pets/helpers.ts")).toBe("export const help = 1;\n");
  }, 20_000);

  it("takes no path and no content from the request", async () => {
    put("package.json", '{ "name": "mine" }\n');
    const url = await start();

    const reply = await post(url, "/api/apis/write", { ...WRITE, files: [{ path: "package.json", content: "pwned" }] });

    expect(reply.status).toBe(200);
    expect(read("package.json")).toBe('{ "name": "mine" }\n');
  }, 20_000);

  it.skipIf(IS_WINDOWS)("writes nothing through a directory link that leads outside the project", async () => {
    mkdirSync(join(scratch, "outside"));
    writeFileSync(join(scratch, "outside/keep.ts"), "keep\n");
    mkdirSync(join(root, "src/api"), { recursive: true });
    symlinkSync(join(scratch, "outside"), join(root, "src/api/pets"));
    const url = await start();

    const reply = await post(url, "/api/apis/write", WRITE);

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: "TARGET_BLOCKED" });
    expect(readFileSync(join(scratch, "outside/keep.ts"), "utf8")).toBe("keep\n");
    expect(existsSync(join(scratch, "outside/source.ts"))).toBe(false);
  }, 20_000);

  it("asks before replacing a file Studio never wrote, and backs it up once allowed", async () => {
    put("src/api/pets/index.ts", "hand-written\n");
    const url = await start();

    const asked = await post(url, "/api/apis/write", WRITE);
    const { digest, pending } = planOf(asked);
    const allowed = await post(url, "/api/apis/write", { ...WRITE, planDigest: digest, confirm: ["src/api/pets/index.ts"] });

    expect(asked.status).toBe(409);
    expect(asked.body).toMatchObject({ code: "NEEDS_CONFIRMATION" });
    expect(pending.map((step) => step.path)).toEqual(["src/api/pets/index.ts"]);
    expect(allowed.status).toBe(200);
    expect(readGeneratedFile(read("src/api/pets/index.ts")).header?.import).toBe("pets");
    expect(read(`${String(allowed.body.backupDir)}/src/api/pets/index.ts`)).toBe("hand-written\n");
  }, 20_000);

  it("refuses the plan the user saw once a file it rests on changed", async () => {
    put("src/api/pets/index.ts", "hand-written\n");
    const url = await start();
    const { digest } = planOf(await post(url, "/api/apis/write", WRITE));
    put("src/api/pets/index.ts", "edited since\n");

    const reply = await post(url, "/api/apis/write", { ...WRITE, planDigest: digest, confirm: ["src/api/pets/index.ts"] });

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: "PLAN_STALE" });
    expect(read("src/api/pets/index.ts")).toBe("edited since\n");
  }, 20_000);

  it("keeps the user's edit to an endpoint through a rewrite", async () => {
    const url = await start();
    await post(url, "/api/apis/write", WRITE);
    const edited = read(GROUP_FILE).replace('endpoint.get("")', 'endpoint.get("").query<{ page: number }>()');
    expect(edited).toContain(".query<{ page: number }>()");
    put(GROUP_FILE, edited);

    const again = await post(url, "/api/apis/write", WRITE);

    expect(again.status).toBe(200);
    expect(read(GROUP_FILE)).toContain(".query<{ page: number }>()");
  }, 20_000);
});

describe("imports that would share a directory", () => {
  it("refuses to write an import into the directory another import is declared with", async () => {
    put(
      "courier.config.ts",
      CONFIG.replace(
        "imports: {",
        'imports: { petsCopy: { importType: "file", type: "openapi", outputDir: "src/api", sourceName: "pets" },',
      ),
    );
    const url = await start();

    const reply = await post(url, "/api/apis/write", WRITE);

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: "DIR_OVERLAP" });
    expect(existsSync(join(root, "src/api/pets"))).toBe(false);
  }, 20_000);

  it("refuses to manage an import whose directory another import is declared with", async () => {
    put(
      "courier.config.ts",
      CONFIG.replace(
        "imports: {",
        'imports: { petsCopy: { importType: "file", type: "openapi", outputDir: "src/api", sourceName: "pets" },',
      ),
    );
    const url = await start();

    const reply = await post(url, "/api/apis/manage/preview", { name: "pets", spec: SPEC, toAdd: { pets: ["listPets"] } });

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: "DIR_OVERLAP" });
  }, 20_000);

  it("refuses to write an import inside a directory another import wrote", async () => {
    const url = await start();
    await post(url, "/api/apis/write", WRITE);
    const nested = { ...WRITE, sourceName: "inner", options: { ...WRITE.options, outputDir: "src/api/pets", sourceName: "inner" } };

    const reply = await post(url, "/api/apis/write", nested);

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: "DIR_OVERLAP" });
    expect(existsSync(join(root, "src/api/pets/inner"))).toBe(false);
  }, 20_000);
});

describe("removing an import", () => {
  it("shows what goes, holds an edited file for consent, and removes the rest into a backup", async () => {
    const url = await start();
    await post(url, "/api/apis/write", WRITE);
    put(GROUP_FILE, `${read(GROUP_FILE)}// my note\n`);

    const preview = await post(url, "/api/apis/imports/remove/preview", { name: "pets" });
    const { digest, pending } = planOf(preview);
    const removed = await post(url, "/api/apis/imports/remove", { name: "pets", planDigest: digest });

    expect(preview.status).toBe(200);
    expect(pending.map((step) => step.path)).toEqual([GROUP_FILE]);
    expect(removed.status).toBe(200);
    expect(existsSync(join(root, "src/api/pets/source.ts"))).toBe(false);
    expect(read(GROUP_FILE)).toContain("// my note");
    expect(existsSync(join(root, String(removed.body.backupDir), "src/api/pets/source.ts"))).toBe(true);
  }, 20_000);
});

describe("removing an import without its preview", () => {
  it("refuses, with the plan to show, and removes nothing", async () => {
    const url = await start();
    await post(url, "/api/apis/write", WRITE);

    const reply = await post(url, "/api/apis/imports/remove", { name: "pets" });

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: "PLAN_NOT_SEEN" });
    expect(planOf(reply).digest).not.toBe("");
    expect(existsSync(join(root, "src/api/pets/source.ts"))).toBe(true);
  }, 20_000);
});

describe("removing an import the config still imports", () => {
  it("names the files the config imports among those the removal takes away", async () => {
    symlinkSync(REPO_NODE_MODULES, join(root, "node_modules"), "dir");
    await post(await start(), "/api/apis/write", WRITE);
    await studio?.close();
    put("courier.config.ts", `import { pets } from "./src/api/pets/source";\n${CONFIG.replace("sources: {", "sources: { pets,")}`);
    const url = await start();

    const preview = await post(url, "/api/apis/imports/remove/preview", { name: "pets" });

    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ configFile: "courier.config.ts", importDeclared: true });
    expect(preview.body.configImports).toContain("src/api/pets/source.ts");
    expect(preview.body.configImports).not.toContain("src/api/pets/index.ts");
  }, 30_000);
});

describe("managing an import's endpoints", () => {
  it("keeps hand-written files in a group's directory when the group goes", async () => {
    const url = await start();
    await post(url, "/api/apis/write", WRITE);
    put("src/api/pets/pets/helpers.ts", "export const help = 1;\n");
    const body = { name: "pets", spec: SPEC, toAdd: {}, toRemove: { pets: ["listPets", "createPet"] } };
    const { digest } = planOf(await post(url, "/api/apis/manage/preview", body));

    const reply = await post(url, "/api/apis/manage/apply", { ...body, planDigest: digest });

    expect(reply.status).toBe(200);
    expect(existsSync(join(root, GROUP_FILE))).toBe(false);
    expect(read("src/api/pets/pets/helpers.ts")).toBe("export const help = 1;\n");
  }, 20_000);
});

const TWO_GROUPS = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Pets", version: "1" },
    paths: {
      "/pets": {
        get: { operationId: "listPets", tags: ["pets"], responses: { "200": { description: "ok" } } },
        post: { operationId: "createPet", tags: ["pets"], responses: { "200": { description: "ok" } } },
      },
      "/users": {
        get: {
          operationId: "listUsers",
          tags: ["users"],
          responses: {
            "200": {
              description: "ok",
              content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
            },
          },
        },
      },
    },
    components: { schemas: { User: { type: "object", properties: { id: { type: "string" } } } } },
  }),
);

/* Write the import with only some endpoints, then preview and apply managing it as the dialog does. */
async function manage(
  url: string,
  change: { toAdd?: Record<string, string[]>; toRemove?: Record<string, string[]> },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = { name: "pets", spec: TWO_GROUPS, toAdd: {}, toRemove: {}, ...change };
  const preview = await post(url, "/api/apis/manage/preview", body);
  return post(url, "/api/apis/manage/apply", { ...body, planDigest: planOf(preview).digest });
}

function writeSome(groupBy: "tag" | "single"): unknown {
  const options = { ...WRITE.options, groupBy, selectedEndpoints: { pets: ["listPets"], users: ["listUsers"] } };
  return { ...WRITE, spec: TWO_GROUPS, options };
}

describe("adding and removing endpoints through manage", () => {
  it("adds to a group file keeping how it names its base, and never adds an endpoint twice", async () => {
    const url = await start();
    await post(url, "/api/apis/write", writeSome("tag"));

    const first = await manage(url, { toAdd: { pets: ["createPet"] } });
    const again = await manage(url, { toAdd: { pets: ["createPet", "listPets"] } });

    const group = read(GROUP_FILE);
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(group).toContain("const { endpoint } = courier();");
    expect(group.match(/createPet:/g)).toHaveLength(1);
    expect(group.match(/listPets:/g)).toHaveLength(1);
  }, 30_000);

  it("adds to a flat import's source, which imports no group file", async () => {
    put("courier.config.ts", CONFIG.replace('outputDir: "src/api"', 'outputDir: "src/api", groupBy: "single"'));
    const url = await start();
    await post(url, "/api/apis/write", writeSome("single"));

    const reply = await manage(url, { toAdd: { pets: ["createPet"] } });

    const source = read("src/api/pets/source.ts");
    expect(reply.status).toBe(200);
    expect(source).not.toContain("./pets/index");
    expect(source).toMatch(/export const pets = defineApi\(\{/);
    expect(source).toContain("createPet:");
    expect(source).toContain("listPets:");
  }, 30_000);

  it("drops a group removed whole from the barrel as well as from the source", async () => {
    const url = await start();
    await post(url, "/api/apis/write", writeSome("tag"));
    expect(read("src/api/pets/index.ts")).toContain("./users/");

    const reply = await manage(url, { toRemove: { users: ["listUsers"] } });

    expect(reply.status).toBe(200);
    expect(existsSync(join(root, "src/api/pets/users"))).toBe(false);
    expect(read("src/api/pets/index.ts")).not.toContain("./users/");
    expect(read("src/api/pets/source.ts")).not.toContain("./users/");
  }, 30_000);

  it("refuses to apply a plan the request does not quote", async () => {
    const url = await start();
    await post(url, "/api/apis/write", writeSome("tag"));

    const reply = await post(url, "/api/apis/manage/apply", { name: "pets", spec: TWO_GROUPS, toRemove: { users: ["listUsers"] } });

    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: "PLAN_NOT_SEEN" });
    expect(existsSync(join(root, "src/api/pets/users/index.ts"))).toBe(true);
  }, 30_000);
});

describe("starting Studio", () => {
  it("undoes a write to an import's files that a crash cut short", async () => {
    put("src/api/pets/index.ts", "written by the crashed apply\n");
    put(".courier/backups/1-crash/src/api/pets/index.ts", "as it was\n");
    saveJournal(root, {
      id: "1-crash",
      importName: "pets",
      state: "committing",
      backupDir: ".courier/backups/1-crash",
      entries: [
        { path: "src/api/pets/index.ts", step: "write", existed: true, sha256: bodyHash("written by the crashed apply\n") },
      ],
      createdDirs: [],
      temps: [],
    });

    await start();

    expect(read("src/api/pets/index.ts")).toBe("as it was\n");
    expect(existsSync(join(root, ".courier/journal/1-crash.json"))).toBe(false);
  }, 20_000);
});
