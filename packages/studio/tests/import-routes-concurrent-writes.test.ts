/**
 * Requests that change one import at the same moment are applied one after
 * another: the files end as one of them left them, the imports state
 * records exactly those files with their hashes, and no temporary file or
 * journal is left behind.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { bodyHash } from "../src/server/import-files/body-hash";
import { readGeneratedFile } from "../src/server/import-files/generated-header";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

function specWith(paths: Record<string, unknown>): ReturnType<typeof parseSpec> {
  return parseSpec(JSON.stringify({ openapi: "3.1.0", info: { title: "Pets", version: "1" }, paths }));
}

const PETS_PATHS = {
  "/pets": {
    get: { operationId: "listPets", tags: ["pets"], responses: { "200": { description: "ok" } } },
    post: { operationId: "createPet", tags: ["pets"], responses: { "200": { description: "ok" } } },
  },
};
const USERS_PATHS = {
  "/users": { get: { operationId: "listUsers", tags: ["users"], responses: { "200": { description: "ok" } } } },
};
const SPEC_A = specWith(PETS_PATHS);
const SPEC_B = specWith({ ...PETS_PATHS, ...USERS_PATHS });
const SPEC_C = specWith(USERS_PATHS);
const CONFIG =
  'export default { sources: { api: { baseURL: "https://api.example" } }, imports: { pets: { importType: "file", type: "openapi", outputDir: "src/api" } } };\n';
const OPTIONS = { type: "openapi", outputDir: "src/api", sourceName: "pets" };
const DIR = "src/api/pets";

let scratch: string;
let root: string;
let studio: StudioServer | undefined;
let url: string;

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-b2-race-")));
  root = join(scratch, "proj");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "courier.config.ts"), CONFIG);
  url = await new Promise((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
}, 30_000);

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(scratch, { recursive: true, force: true });
});

async function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  return { status: response.status, body: typeof payload === "object" && payload !== null ? { ...payload } : {} };
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) out.push(relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"));
  }
  return out.sort();
}

interface State {
  imports: Record<string, { dir: string; files: Record<string, { sha256: string }> }>;
  applied: string[];
}

function state(): State {
  return JSON.parse(readFileSync(join(root, ".courier/imports-state.json"), "utf8")) as State;
}

/* The record and the disk agree, and nothing of an apply in progress is left. */
function expectConsistent(): void {
  const recorded = state().imports.pets?.files ?? {};
  const onDisk = filesUnder(join(root, DIR));
  expect(onDisk.filter((path) => path.includes(".courier.import"))).toEqual([]);
  expect(Object.keys(recorded).sort()).toEqual(onDisk);
  for (const path of onDisk) {
    const { header, body } = readGeneratedFile(readFileSync(join(root, path), "utf8"));
    expect(header?.import).toBe("pets");
    expect(recorded[path]?.sha256).toBe(bodyHash(body));
  }
  expect(filesUnder(join(root, ".courier/journal"))).toEqual([]);
}

function write(spec: ReturnType<typeof parseSpec>): Promise<{ status: number; body: Record<string, unknown> }> {
  return post("/api/apis/write", { sourceName: "pets", spec, options: OPTIONS });
}

describe("two writes to one import at once", () => {
  it("the same write twice: both succeed, one set of files, state matches", async () => {
    const replies = await Promise.all([write(SPEC_A), write(SPEC_A)]);

    expect(replies.map((reply) => reply.status)).toEqual([200, 200]);
    expectConsistent();
    expect(filesUnder(join(root, DIR))).toEqual([`${DIR}/index.ts`, `${DIR}/pets/index.ts`, `${DIR}/source.ts`]);
  }, 20_000);

  it("two different specs: the files are exactly one spec's, state matches", async () => {
    const replies = await Promise.all([write(SPEC_B), write(SPEC_C)]);

    expect(replies.map((reply) => reply.status)).toEqual([200, 200]);
    expectConsistent();
    const groups = filesUnder(join(root, DIR));
    const asB = [`${DIR}/index.ts`, `${DIR}/pets/index.ts`, `${DIR}/source.ts`, `${DIR}/users/index.ts`];
    const asC = [`${DIR}/index.ts`, `${DIR}/source.ts`, `${DIR}/users/index.ts`];
    expect([JSON.stringify(asB), JSON.stringify(asC)]).toContain(JSON.stringify(groups));
  }, 20_000);

  it("six writes of three specs at once: every one answers, and the end state is consistent", async () => {
    const replies = await Promise.all([SPEC_A, SPEC_B, SPEC_C, SPEC_A, SPEC_B, SPEC_C].map(write));

    expect(replies.map((reply) => reply.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expectConsistent();
    expect(state().applied.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("a write racing a removal: the import ends written and recorded, or removed and forgotten", async () => {
    await write(SPEC_B);
    const digest = ((await post("/api/apis/imports/remove/preview", { name: "pets" })).body.plan as { digest: string }).digest;

    const [written, removed] = await Promise.all([
      write(SPEC_C),
      post("/api/apis/imports/remove", { name: "pets", planDigest: digest }),
    ]);

    expect([200, 409]).toContain(removed.status);
    expect(written.status).toBe(200);
    const record = state().imports.pets;
    if (record === undefined) expect(filesUnder(join(root, DIR)).filter((path) => readFileSync(join(root, path), "utf8").includes("@courier-generated"))).toEqual([]);
    else expectConsistent();
  }, 20_000);

  it("a write racing an update apply: the state still matches the files", async () => {
    await write(SPEC_A);
    const preview = await post("/api/apis/update/preview", { name: "pets", newSpec: SPEC_B });
    const digest = (preview.body.plan as { digest: string }).digest;

    const replies = await Promise.all([
      post("/api/apis/update/apply", { name: "pets", newSpec: SPEC_B, planDigest: digest }),
      write(SPEC_C),
    ]);

    expect(replies.every((reply) => reply.status === 200 || reply.status === 409)).toBe(true);
    expectConsistent();
  }, 20_000);

  it("concurrent writes to two different imports: each record matches its own folder", async () => {
    writeFileSync(
      join(root, "courier.config.ts"),
      CONFIG.replace("imports: {", 'imports: { cats: { importType: "file", type: "openapi", outputDir: "src/api", sourceName: "cats" },'),
    );
    const cats = { sourceName: "cats", spec: SPEC_B, options: { ...OPTIONS, sourceName: "cats" } };

    const replies = await Promise.all([write(SPEC_B), post("/api/apis/write", cats), write(SPEC_C)]);

    expect(replies.map((reply) => reply.status)).toEqual([200, 200, 200]);
    expectConsistent();
    const catsFiles = state().imports.cats?.files ?? {};
    expect(Object.keys(catsFiles).sort()).toEqual(filesUnder(join(root, "src/api/cats")));
  }, 30_000);
});

