/**
 * `.courier/imports-state.json` can arrive with a project, so Studio cannot
 * trust it to name the import's folder. Whatever a crafted record says —
 * files outside its folder, or a folder other than the one courier.config
 * declares — no remove, update, manage or write changes a file outside the
 * import's declared folder.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import { bodyHash } from "../src/server/import-files/body-hash";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

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
const MAIN = "export const main = 1;\n";
const PACKAGE = '{ "name": "mine" }\n';
const GIT_CONFIG = "[core]\n\tbare = false\n";

let scratch: string;
let root: string;
let studio: StudioServer | undefined;
let url: string;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-b2-state-")));
  root = join(scratch, "proj");
  put("courier.config.ts", CONFIG);
  put("package.json", PACKAGE);
  put("src/main.ts", MAIN);
  put(".git/config", GIT_CONFIG);
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
  walk(root, "");
  return out;
}

/* Paths whose entry changed, outside the import's declared folder and `.courier`. */
function changedOutsideTheImport(before: Record<string, string>): string[] {
  const after = snapshot();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter((path) => before[path] !== after[path])
    .filter(
      (path) =>
        path !== DIR &&
        !path.startsWith(`${DIR}/`) &&
        path !== ".courier" &&
        !path.startsWith(".courier/"),
    )
    .filter((path) => path !== "src/api")
    .sort();
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

function plannedPaths(reply: { body: Record<string, unknown> }): string[] {
  const plan = reply.body.plan as
    | {
        removals?: Array<{ path: string }>;
        pending?: Array<{ path: string }>;
        writes?: Array<{ path: string }>;
      }
    | undefined;
  return [...(plan?.removals ?? []), ...(plan?.pending ?? []), ...(plan?.writes ?? [])].map(
    (step) => step.path,
  );
}

/* Rewrite the state Studio saved, as a project could ship it. */
function craftState(edit: (imports: Record<string, Record<string, unknown>>) => void): void {
  const path = join(root, ".courier/imports-state.json");
  const state = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as {
        imports: Record<string, Record<string, unknown>>;
      })
    : { version: 2, imports: {}, applied: [] };
  edit(state.imports);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

const RECORD = {
  specHash: "0",
  fetchedAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: "2026-01-01T00:00:00.000Z",
};

/* [label, crafted dir, crafted files, the file outside the declared folder that must survive]. */
const OTHER_DIRS: Array<[string, string, Record<string, string>, string]> = [
  ["a parent of the declared folder", "src", { "src/main.ts": MAIN }, "src/main.ts"],
  ["the project itself as '.'", ".", { "./package.json": PACKAGE }, "package.json"],
  [".git", ".git", { ".git/config": GIT_CONFIG }, ".git/config"],
];

describe("a crafted record whose dir differs from the declaration", () => {
  it.each(OTHER_DIRS)(
    "dir = %s: remove preview and remove leave %s's file alone",
    async (_label, dir, files, survivor) => {
      await start();
      await post("/api/apis/write", WRITE);
      craftState((imports) => {
        const pets = imports.pets as { files: Record<string, unknown> };
        imports.pets = {
          ...RECORD,
          dir,
          files: Object.fromEntries(
            Object.entries(files).map(([path, body]) => [path, { sha256: bodyHash(body) }]),
          ),
        };
        void pets;
      });
      const before = snapshot();

      const preview = await post("/api/apis/imports/remove/preview", { name: "pets" });
      const removal = await post("/api/apis/imports/remove", {
        name: "pets",
        planDigest: preview.status === 200 ? digestOf(preview) : "",
        confirm: [],
      });

      expect.soft(plannedPaths(preview).filter((path) => !path.startsWith(`${DIR}/`))).toEqual([]);
      expect.soft(removal.status, JSON.stringify(removal.body).slice(0, 300)).not.toBe(500);
      expect.soft(changedOutsideTheImport(before)).toEqual([]);
      expect.soft(existsSync(join(root, survivor))).toBe(true);
    },
    20_000,
  );

  it.each(OTHER_DIRS)(
    "dir = %s: update, manage and write leave the file alone",
    async (_label, dir, files, survivor) => {
      await start();
      await post("/api/apis/write", WRITE);
      craftState((imports) => {
        const pets = imports.pets as { files: Record<string, unknown> };
        imports.pets = {
          ...RECORD,
          dir,
          files: {
            ...Object.fromEntries(
              Object.entries(files).map(([path, body]) => [path, { sha256: bodyHash(body) }]),
            ),
            ...(dir === "src" ? pets.files : {}),
          },
        };
      });
      const before = snapshot();

      const updatePreview = await post("/api/apis/update/preview", { name: "pets", newSpec: SPEC });
      const update = await post("/api/apis/update/apply", {
        name: "pets",
        newSpec: SPEC,
        planDigest: updatePreview.status === 200 ? digestOf(updatePreview) : "",
      });
      const manageBody = { name: "pets", spec: SPEC, toRemove: { users: ["listUsers"] } };
      const managePreview = await post("/api/apis/manage/preview", manageBody);
      const manage = await post("/api/apis/manage/apply", {
        ...manageBody,
        planDigest: managePreview.status === 200 ? digestOf(managePreview) : "",
      });
      const write = await post("/api/apis/write", WRITE);

      expect
        .soft([update.status, manage.status, write.status].filter((status) => status === 500))
        .toEqual([]);
      expect.soft(changedOutsideTheImport(before)).toEqual([]);
      expect.soft(existsSync(join(root, survivor))).toBe(true);
    },
    30_000,
  );
});

describe("a crafted record whose files lie outside its own dir", () => {
  it.each([
    ["a sibling file", { "src/main.ts": MAIN }],
    ["a climbing path", { "src/api/pets/../../main.ts": MAIN }],
    ["an absolute path", { [join("/", "src/main.ts")]: MAIN }],
    ["a backslash path", { "src/api/pets\\..\\..\\main.ts": MAIN }],
    ["a dot-prefixed spelling", { "./src/main.ts": MAIN }],
  ])(
    "%s: the record is dropped and nothing outside the folder goes",
    async (_label, files) => {
      await start();
      await post("/api/apis/write", WRITE);
      craftState((imports) => {
        const pets = imports.pets as { files: Record<string, unknown> };
        pets.files = {
          ...pets.files,
          ...Object.fromEntries(
            Object.entries(files).map(([path, body]) => [path, { sha256: bodyHash(body) }]),
          ),
        };
      });
      const before = snapshot();

      const preview = await post("/api/apis/imports/remove/preview", { name: "pets" });
      const removal = await post("/api/apis/imports/remove", {
        name: "pets",
        planDigest: preview.status === 200 ? digestOf(preview) : "",
        confirm: (
          (preview.body.plan as { pending?: Array<{ path: string }> } | undefined)?.pending ?? []
        ).map((step) => step.path),
      });

      expect(removal.status).not.toBe(500);
      expect(changedOutsideTheImport(before)).toEqual([]);
      expect(read("src/main.ts")).toBe(MAIN);
    },
    20_000,
  );
});

describe("a crafted record for an import courier.config does not declare", () => {
  it.each(OTHER_DIRS)(
    "dir = %s: removing it takes nothing outside a folder Studio could have written",
    async (_label, dir, files, survivor) => {
      await start();
      craftState((imports) => {
        imports.ghost = {
          ...RECORD,
          dir,
          files: Object.fromEntries(
            Object.entries(files).map(([path, body]) => [path, { sha256: bodyHash(body) }]),
          ),
        };
      });
      const before = snapshot();

      const preview = await post("/api/apis/imports/remove/preview", { name: "ghost" });
      const removal = await post("/api/apis/imports/remove", {
        name: "ghost",
        planDigest: preview.status === 200 ? digestOf(preview) : "",
      });

      expect.soft(plannedPaths(preview)).toEqual([]);
      expect.soft(removal.status, JSON.stringify(removal.body).slice(0, 300)).not.toBe(500);
      expect.soft(changedOutsideTheImport(before)).toEqual([]);
      expect.soft(existsSync(join(root, survivor))).toBe(true);
    },
    20_000,
  );
});
