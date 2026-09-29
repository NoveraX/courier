/**
 * What is on disk decides what an apply may do: a file changed since the
 * preview stops it, a hand-written file stays, and a symbolic link — as the
 * import's folder, above it, as a target, or as `.courier` or a folder in
 * it — is never written through, replaced or removed.
 */
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { makeFedFifo, stopFifoWriters } from "./helpers/make-fed-fifo";
import { tokenHeader } from "./helpers/token-header";

const IS_WINDOWS = process.platform === "win32";
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
        post: {
          operationId: "createPet",
          tags: ["pets"],
          responses: { "200": { description: "ok" } },
        },
      },
      "/users": {
        get: {
          operationId: "listUsers",
          tags: ["users"],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  }),
);
const CONFIG =
  'export default { sources: { api: { baseURL: "https://api.example" } }, imports: { pets: { importType: "file", type: "openapi", outputDir: "src/api" } } };\n';
const WRITE = {
  sourceName: "pets",
  spec: SPEC,
  options: { type: "openapi", outputDir: "src/api", sourceName: "pets" },
};
const DIR = "src/api/pets";
const SOURCE = `${DIR}/source.ts`;
const INDEX = `${DIR}/index.ts`;
const GROUP_FILE = `${DIR}/pets/index.ts`;
const HAND = "hand-written\n";

let scratch: string;
let root: string;
let studio: StudioServer | undefined;
let url: string;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-b2-disk-")));
  root = join(scratch, "proj");
  mkdirSync(join(scratch, "outside"));
  writeFileSync(join(scratch, "outside/keep.ts"), "keep\n");
  put("courier.config.ts", CONFIG);
  put("package.json", '{ "name": "mine" }\n');
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  stopFifoWriters();
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

async function start(): Promise<void> {
  url = await new Promise((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

async function post(
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  return {
    status: response.status,
    body: typeof payload === "object" && payload !== null ? { ...payload } : {},
  };
}

function snapshot(under: string = scratch): Record<string, string> {
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
  walk(under, "");
  return out;
}

function digestOf(reply: { body: Record<string, unknown> }): string {
  const plan = reply.body.plan;
  if (
    typeof plan !== "object" ||
    plan === null ||
    !("digest" in plan) ||
    typeof plan.digest !== "string"
  ) {
    throw new Error(`no plan in ${JSON.stringify(reply.body)}`);
  }
  return plan.digest;
}

describe("a file changed between preview and apply", () => {
  it("update → 409 PLAN_STALE, the change kept, nothing else changed", async () => {
    await start();
    await post("/api/apis/write", WRITE);
    const digest = digestOf(
      await post("/api/apis/update/preview", { name: "pets", newSpec: SPEC }),
    );
    put(GROUP_FILE, `${read(GROUP_FILE)}// changed since the preview\n`);
    const before = snapshot();

    const reply = await post("/api/apis/update/apply", {
      name: "pets",
      newSpec: SPEC,
      planDigest: digest,
    });

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "PLAN_STALE",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it("manage → 409 PLAN_STALE, nothing changed", async () => {
    await start();
    await post("/api/apis/write", WRITE);
    const body = { name: "pets", spec: SPEC, toRemove: { users: ["listUsers"] } };
    const digest = digestOf(await post("/api/apis/manage/preview", body));
    put(`${DIR}/users/index.ts`, `${read(`${DIR}/users/index.ts`)}// changed since the preview\n`);
    const before = snapshot();

    const reply = await post("/api/apis/manage/apply", { ...body, planDigest: digest });

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "PLAN_STALE",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it("remove → 409 PLAN_STALE, nothing removed", async () => {
    await start();
    await post("/api/apis/write", WRITE);
    const digest = digestOf(await post("/api/apis/imports/remove/preview", { name: "pets" }));
    put(INDEX, `${read(INDEX)}// changed since the preview\n`);
    const before = snapshot();

    const reply = await post("/api/apis/imports/remove", { name: "pets", planDigest: digest });

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "PLAN_STALE",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it("a file created, after the preview, where the update would create one → 409 PLAN_STALE", async () => {
    await start();
    const petsOnly = {
      ...WRITE,
      options: { ...WRITE.options, selectedEndpoints: { pets: ["listPets", "createPet"] } },
    };
    await post("/api/apis/write", petsOnly);
    const digest = digestOf(
      await post("/api/apis/update/preview", { name: "pets", newSpec: SPEC }),
    );
    put(`${DIR}/users/index.ts`, HAND);
    const before = snapshot();

    const reply = await post("/api/apis/update/apply", {
      name: "pets",
      newSpec: SPEC,
      planDigest: digest,
    });

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "PLAN_STALE",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);
});

describe("a hand-written file in the import's folder", () => {
  it("stays through a write, an update, a group removed by manage and the import's removal", async () => {
    await start();
    await post("/api/apis/write", WRITE);
    put(`${DIR}/helpers.ts`, HAND);
    put(`${DIR}/users/notes.ts`, HAND);

    const write = await post("/api/apis/write", WRITE);
    const updateDigest = digestOf(
      await post("/api/apis/update/preview", { name: "pets", newSpec: SPEC }),
    );
    const update = await post("/api/apis/update/apply", {
      name: "pets",
      newSpec: SPEC,
      planDigest: updateDigest,
    });
    const manageBody = { name: "pets", spec: SPEC, toRemove: { users: ["listUsers"] } };
    const manageDigest = digestOf(await post("/api/apis/manage/preview", manageBody));
    const manage = await post("/api/apis/manage/apply", {
      ...manageBody,
      planDigest: manageDigest,
    });
    const removeDigest = digestOf(await post("/api/apis/imports/remove/preview", { name: "pets" }));
    const removal = await post("/api/apis/imports/remove", {
      name: "pets",
      planDigest: removeDigest,
    });

    expect([write.status, update.status, manage.status, removal.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(read(`${DIR}/helpers.ts`)).toBe(HAND);
    expect(read(`${DIR}/users/notes.ts`)).toBe(HAND);
    expect(existsSync(join(root, SOURCE))).toBe(false);
  }, 30_000);
});

describe.skipIf(IS_WINDOWS)("a symbolic link as the import's folder or above it", () => {
  it("import folder → a folder inside the project: nothing is written through it", async () => {
    put("lib/keep.ts", "keep\n");
    mkdirSync(join(root, "src/api"), { recursive: true });
    symlinkSync(join(root, "lib"), join(root, DIR));
    await start();
    const before = snapshot(join(root, "lib"));

    const reply = await post("/api/apis/write", WRITE);

    expect.soft(reply.status, JSON.stringify(reply.body).slice(0, 300)).toBe(409);
    expect.soft(snapshot(join(root, "lib"))).toEqual(before);
  }, 20_000);

  it("outputDir → a folder inside the project: nothing is written through it", async () => {
    put("lib/keep.ts", "keep\n");
    mkdirSync(join(root, "src"), { recursive: true });
    symlinkSync(join(root, "lib"), join(root, "src/api"));
    await start();
    const before = snapshot(join(root, "lib"));

    const reply = await post("/api/apis/write", WRITE);

    expect.soft(reply.status, JSON.stringify(reply.body).slice(0, 300)).toBe(409);
    expect.soft(snapshot(join(root, "lib"))).toEqual(before);
  }, 20_000);

  it("outputDir → a folder outside the project: 4xx, nothing written outside", async () => {
    mkdirSync(join(root, "src"), { recursive: true });
    symlinkSync(join(scratch, "outside"), join(root, "src/api"));
    await start();
    const before = snapshot(join(scratch, "outside"));

    const reply = await post("/api/apis/write", WRITE);

    expect([400, 409]).toContain(reply.status);
    expect(snapshot(join(scratch, "outside"))).toEqual(before);
  }, 20_000);

  it("import folder swapped, after a write, for a link to a copy inside the project: removal takes nothing from the copy", async () => {
    await start();
    await post("/api/apis/write", WRITE);
    cpSync(join(root, DIR), join(root, "lib/pets-copy"), { recursive: true });
    rmSync(join(root, DIR), { recursive: true });
    symlinkSync(join(root, "lib/pets-copy"), join(root, DIR));
    const before = snapshot(join(root, "lib"));

    const preview = await post("/api/apis/imports/remove/preview", { name: "pets" });
    const reply = await post("/api/apis/imports/remove", {
      name: "pets",
      planDigest: digestOf(preview),
      confirm: [],
    });

    expect.soft(reply.status, JSON.stringify(reply.body).slice(0, 300)).not.toBe(500);
    expect.soft(snapshot(join(root, "lib"))).toEqual(before);
  }, 20_000);

  it("import folder swapped, after a write, for a link to a copy outside the project: removal takes nothing from it", async () => {
    await start();
    await post("/api/apis/write", WRITE);
    renameSync(join(root, DIR), join(scratch, "outside/pets"));
    symlinkSync(join(scratch, "outside/pets"), join(root, DIR));
    const before = snapshot(join(scratch, "outside"));

    const preview = await post("/api/apis/imports/remove/preview", { name: "pets" });
    const reply = await post("/api/apis/imports/remove", {
      name: "pets",
      planDigest: digestOf(preview),
    });

    expect(reply.status).not.toBe(500);
    expect(snapshot(join(scratch, "outside"))).toEqual(before);
  }, 20_000);

  it("import folder swapped for a link inside the project: an update writes nothing through it", async () => {
    await start();
    await post("/api/apis/write", WRITE);
    cpSync(join(root, DIR), join(root, "lib/pets-copy"), { recursive: true });
    rmSync(join(root, DIR), { recursive: true });
    symlinkSync(join(root, "lib/pets-copy"), join(root, DIR));
    const newSpec = parseSpec(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Pets", version: "2" },
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
    const before = snapshot(join(root, "lib"));

    const preview = await post("/api/apis/update/preview", { name: "pets", newSpec });
    const reply = await post("/api/apis/update/apply", {
      name: "pets",
      newSpec,
      planDigest: preview.status === 200 ? digestOf(preview) : "",
    });

    expect.soft(reply.status, JSON.stringify(reply.body).slice(0, 300)).toBe(409);
    expect.soft(snapshot(join(root, "lib"))).toEqual(before);
  }, 20_000);
});

describe.skipIf(IS_WINDOWS)("a symbolic link as a target file", () => {
  it.each([
    ["a project file", "../../../package.json", "package.json"],
    ["a file outside the project", "../../../../outside/keep.ts", "../outside/keep.ts"],
  ])(
    "index.ts → %s: 409 TARGET_BLOCKED, the link and its target unchanged",
    async (_label, link, target) => {
      mkdirSync(join(root, DIR), { recursive: true });
      symlinkSync(link, join(root, INDEX));
      await start();
      const before = snapshot();

      const reply = await post("/api/apis/write", WRITE);

      expect({ status: reply.status, code: reply.body.code }).toEqual({
        status: 409,
        code: "TARGET_BLOCKED",
      });
      expect(snapshot()).toEqual(before);
      expect(readFileSync(join(root, target), "utf8")).not.toContain("courier-generated");
    },
    20_000,
  );

  it("a recorded file replaced by a link: removal keeps the link and its target", async () => {
    await start();
    await post("/api/apis/write", WRITE);
    const body = read(INDEX);
    put("lib/index-copy.ts", body);
    rmSync(join(root, INDEX));
    symlinkSync("../../../lib/index-copy.ts", join(root, INDEX));

    const preview = await post("/api/apis/imports/remove/preview", { name: "pets" });
    const reply = await post("/api/apis/imports/remove", {
      name: "pets",
      planDigest: digestOf(preview),
    });

    expect(reply.status).toBe(200);
    expect(lstatSync(join(root, INDEX)).isSymbolicLink()).toBe(true);
    expect(read("lib/index-copy.ts")).toBe(body);
  }, 20_000);

  it("a folder where index.ts should be: 409 TARGET_BLOCKED, nothing changed", async () => {
    mkdirSync(join(root, INDEX), { recursive: true });
    await start();
    const before = snapshot();

    const reply = await post("/api/apis/write", WRITE);

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "TARGET_BLOCKED",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it("a FIFO where index.ts should be: 409 TARGET_BLOCKED, without hanging", async () => {
    mkdirSync(join(root, DIR), { recursive: true });
    makeFedFifo(join(root, INDEX), "fed\n");
    await start();

    const reply = await post("/api/apis/write", WRITE);

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "TARGET_BLOCKED",
    });
    expect(existsSync(join(root, SOURCE))).toBe(false);
  }, 20_000);

  it("a regular file where the output directory should be: refused, nothing changed", async () => {
    put("src/api", HAND);
    await start();
    const before = snapshot();

    const reply = await post("/api/apis/write", WRITE);

    expect.soft([400, 409], JSON.stringify(reply.body).slice(0, 300)).toContain(reply.status);
    expect.soft(snapshot()).toEqual(before);
  }, 20_000);
});

describe.skipIf(IS_WINDOWS)("a symbolic link as .courier or a folder in it", () => {
  it(".courier → a folder outside: 409 COURIER_DIR_UNSAFE, nothing changed anywhere", async () => {
    mkdirSync(join(scratch, "outside/courier"));
    symlinkSync(join(scratch, "outside/courier"), join(root, ".courier"));
    await start();
    const before = snapshot();

    const reply = await post("/api/apis/write", WRITE);

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "COURIER_DIR_UNSAFE",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it(".courier → a folder outside holding a state for pets: removal refused, nothing removed", async () => {
    await start();
    await post("/api/apis/write", WRITE);
    await studio?.close();
    renameSync(join(root, ".courier"), join(scratch, "outside/courier"));
    symlinkSync(join(scratch, "outside/courier"), join(root, ".courier"));
    await start();
    const preview = await post("/api/apis/imports/remove/preview", { name: "pets" });
    const before = snapshot();

    const reply = await post("/api/apis/imports/remove", {
      name: "pets",
      planDigest: preview.status === 200 ? digestOf(preview) : "",
    });

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "COURIER_DIR_UNSAFE",
    });
    expect(snapshot()).toEqual(before);
  }, 30_000);

  it(".courier as a regular file: 409, nothing changed", async () => {
    put(".courier", "not a folder\n");
    await start();
    const before = snapshot();

    const reply = await post("/api/apis/write", WRITE);

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "COURIER_DIR_UNSAFE",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it(".courier/journal → a folder inside the project: 409, nothing changed", async () => {
    mkdirSync(join(root, "lib/journal"), { recursive: true });
    mkdirSync(join(root, ".courier"));
    symlinkSync(join(root, "lib/journal"), join(root, ".courier/journal"));
    await start();
    const before = snapshot();

    const reply = await post("/api/apis/write", WRITE);

    expect({ status: reply.status, code: reply.body.code }).toEqual({
      status: 409,
      code: "COURIER_DIR_UNSAFE",
    });
    expect(snapshot()).toEqual(before);
  }, 20_000);

  it(".courier/backups → a folder inside the project: no backup is written through it", async () => {
    mkdirSync(join(root, "lib/bk"), { recursive: true });
    mkdirSync(join(root, ".courier"));
    symlinkSync(join(root, "lib/bk"), join(root, ".courier/backups"));
    put(INDEX, HAND);
    await start();
    const digest = digestOf(await post("/api/apis/write", WRITE));
    const before = snapshot(join(root, "lib"));

    const reply = await post("/api/apis/write", { ...WRITE, planDigest: digest, confirm: [INDEX] });

    expect.soft(reply.status, JSON.stringify(reply.body).slice(0, 300)).toBe(409);
    expect.soft(snapshot(join(root, "lib"))).toEqual(before);
  }, 20_000);

  it(".courier/backups → a folder outside: refused, and the write undone", async () => {
    mkdirSync(join(scratch, "outside/bk"));
    mkdirSync(join(root, ".courier"));
    symlinkSync(join(scratch, "outside/bk"), join(root, ".courier/backups"));
    put(INDEX, HAND);
    await start();
    const digest = digestOf(await post("/api/apis/write", WRITE));
    const outside = snapshot(join(scratch, "outside"));

    const reply = await post("/api/apis/write", { ...WRITE, planDigest: digest, confirm: [INDEX] });

    expect.soft([400, 409], JSON.stringify(reply.body).slice(0, 300)).toContain(reply.status);
    expect.soft(snapshot(join(scratch, "outside"))).toEqual(outside);
    expect.soft(read(INDEX)).toBe(HAND);
    expect.soft(existsSync(join(root, SOURCE))).toBe(false);
  }, 20_000);
});
