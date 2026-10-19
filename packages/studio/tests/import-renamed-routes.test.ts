/**
 * An import Studio 0.3.0 wrote as `undefined`, in `src/api/undefined`, is
 * bound as `undefinedGroup` in `src/api/undefined-group` now. Updating,
 * managing or writing it is refused 409 `IMPORT_RENAMED` with nothing
 * written — they made a second copy the config did not import, or found
 * none of its endpoints — and removing it works on the folder 0.3.0 wrote,
 * so it can be imported again under its new name.
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
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeSpecHash } from "../src/apis";
import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import { bodyHash } from "../src/server/import-files/body-hash";
import { signGeneratedFile } from "../src/server/import-files/generated-header";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Things", version: "1" },
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
const CONFIG = [
  "export default {",
  '  sources: { api: { baseURL: "https://api.example" } },',
  '  imports: { undefined: { importType: "raw", type: "openapi", outputDir: "src/api", sourceName: "undefined" } },',
  "};",
  "",
].join("\n");
const FORMER = "src/api/undefined";
const NOW = "src/api/undefined-group";
const WRITTEN: Record<string, string> = {
  [`${FORMER}/source.ts`]: "export const undefined = { groups: {} };\n",
  [`${FORMER}/index.ts`]: 'export { undefined } from "./source";\n',
  [`${FORMER}/pets/index.ts`]: "export const pets = {};\n",
};
const WRITE = {
  sourceName: "undefined",
  spec: SPEC,
  specUrl: "",
  importType: "raw",
  options: { type: "openapi", outputDir: "src/api", sourceName: "undefined" },
};

let scratch: string;
let root: string;
let studio: StudioServer | undefined;
let url: string;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-import-renamed-")));
  root = join(scratch, "proj");
  put("courier.config.ts", CONFIG);
  for (const [path, body] of Object.entries(WRITTEN))
    put(path, signGeneratedFile("undefined", body));
  const files = Object.fromEntries(
    Object.entries(WRITTEN).map(([path, body]) => [path, { sha256: bodyHash(body) }]),
  );
  const record = {
    specHash: computeSpecHash(SPEC),
    fetchedAt: "2026-01-01T00:00:00.000Z",
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    dir: FORMER,
    files,
  };
  put(
    ".courier/imports-state.json",
    `${JSON.stringify({ version: 2, imports: { undefined: record }, applied: [] }, null, 2)}\n`,
  );
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

/* The project's files outside `.courier`, by path, with their text. */
function project(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (path === ".courier") continue;
      if (entry.isDirectory()) walk(path);
      else out[path] = readFileSync(join(root, path), "utf8");
    }
  };
  walk("");
  return out;
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

interface RemovalPreview {
  plan: { digest: string; dir: string; removals: Array<{ path: string }> };
  config: { status: string; baseHash?: string } | null;
}

function isRemovalPreview(value: unknown): value is RemovalPreview {
  return typeof value === "object" && value !== null && "plan" in value && "config" in value;
}

describe("an import Studio 0.3.0 bound as undefined", () => {
  it("is refused by update, manage and write, which write nothing", async () => {
    await start();
    const before = project();

    const replies = [
      await post("/api/apis/update/preview", { name: "undefined", newSpec: SPEC }),
      await post("/api/apis/manage/inventory", { name: "undefined", newSpec: SPEC }),
      await post("/api/apis/manage/preview", {
        name: "undefined",
        spec: SPEC,
        toAdd: {},
        toRemove: {},
        regenerate: true,
      }),
      await post("/api/apis/manage/preview", {
        name: "undefined",
        spec: SPEC,
        toAdd: { pets: ["listPets"] },
        toRemove: {},
      }),
      await post("/api/apis/write", WRITE),
    ];

    expect(replies.map((reply) => [reply.status, reply.body.code])).toEqual([
      [409, "IMPORT_RENAMED"],
      [409, "IMPORT_RENAMED"],
      [409, "IMPORT_RENAMED"],
      [409, "IMPORT_RENAMED"],
      [409, "IMPORT_RENAMED"],
    ]);
    expect(replies[0]?.body.error).toContain("Remove the import, then import it again");
    expect(project()).toEqual(before);
  }, 20_000);

  it("is removed from the folder 0.3.0 wrote, and then imported again under its new name", async () => {
    await start();

    const preview = await post("/api/apis/imports/remove/preview", { name: "undefined" });
    if (!isRemovalPreview(preview.body)) throw new Error(JSON.stringify(preview.body));
    const { plan, config } = preview.body;
    const removal = await post("/api/apis/imports/remove", {
      name: "undefined",
      planDigest: plan.digest,
      confirm: [],
      ...(config?.status === "ready" && { configBaseHash: config.baseHash }),
    });
    const again = await post("/api/apis/write", WRITE);

    expect(plan.dir).toBe(FORMER);
    expect(plan.removals.map((step) => step.path).sort()).toEqual(Object.keys(WRITTEN).sort());
    expect(removal.status).toBe(200);
    expect(existsSync(join(root, FORMER, "source.ts"))).toBe(false);
    expect(readFileSync(join(root, "courier.config.ts"), "utf8")).not.toContain("undefined");
    expect(again.status, JSON.stringify(again.body).slice(0, 300)).toBe(200);
    expect(again.body.written).toContain(`${NOW}/source.ts`);
    expect(again.body.declaration).toMatchObject({
      source: { importLine: `import { undefinedGroup } from "./${NOW}/source";` },
    });
  }, 20_000);

  it("is refused removal while the folder this release writes holds its files too", async () => {
    put(`${NOW}/source.ts`, signGeneratedFile("undefined", "export {};\n"));
    await start();
    const before = project();

    const preview = await post("/api/apis/imports/remove/preview", { name: "undefined" });

    expect(preview.status).toBe(409);
    expect(preview.body.code).toBe("IMPORT_RENAMED");
    expect(preview.body.error).toContain("Delete the folder you do not keep first.");
    expect(project()).toEqual(before);
  }, 20_000);
});
