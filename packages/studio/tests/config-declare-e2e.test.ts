/**
 * Declaring an imported API in courier.config.ts through Studio, end to end
 * on a real Studio: the import written, the change previewed and applied,
 * after which Studio runs the API; a save between preview and apply; a
 * config Studio cannot add to; a changed config that does not load, which
 * Studio puts back; and callers the routes refuse.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const CACHE = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");

const API =
  'import { courier, defineApi, defineGroup } from "@noverax/courier/define";\n' +
  "const { endpoint } = courier();\n" +
  'const users = defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response<{ id: number }[]>() } });\n' +
  'export const api = defineApi({ baseURL: "https://api.example", groups: { users } });\n';

const CONFIG = 'import { api } from "./src/api";\n\nexport default {\n  sources: { api },\n};\n';

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Pets", version: "1" },
    servers: [{ url: "https://pets.example" }],
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

const IMPORT = {
  sourceName: "petstore",
  spec: SPEC,
  options: { type: "openapi", outputDir: "src/gen", sourceName: "petstore" },
  importType: "raw",
};

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

function project(config = CONFIG): string {
  mkdirSync(CACHE, { recursive: true });
  root = realpathSync(mkdtempSync(join(CACHE, "config-declare ")));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "api.ts"), API);
  writeFileSync(join(root, "courier.config.ts"), config);
  return root;
}

function start(projectRoot: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot,
      onReady: resolve,
      onError: reject,
    });
  });
}

async function post(url: string, path: string, body: unknown, origin: string | null = url) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...tokenHeader(studio),
  };
  if (origin) headers.origin = origin;
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function writeImport(url: string): Promise<void> {
  const written = await post(url, "/api/apis/write", IMPORT);
  expect(written.status).toBe(200);
  expect(written.body.declaration).toBeDefined();
}

function config(): string {
  return readFileSync(join(root, "courier.config.ts"), "utf8");
}

describe("declaring an import in courier.config.ts through Studio", () => {
  it("shows the change, makes it, and runs the imported API", async () => {
    const url = await start(project());
    await writeImport(url);

    const preview = await post(url, "/api/apis/declare/preview", IMPORT);
    expect(preview.body).toMatchObject({ status: "ready", configFile: "courier.config.ts" });
    const applied = await post(url, "/api/apis/declare/apply", {
      ...IMPORT,
      baseHash: preview.body.baseHash,
    });

    expect(applied.body).toEqual({ status: "applied", configFile: "courier.config.ts" });
    expect(config()).toContain('import { petstore } from "./src/gen/petstore/source";');
    expect(config()).toContain("  sources: { api, petstore },\n  imports: {\n    petstore: {\n");
    const after = await post(url, "/api/apis/declare/preview", IMPORT);
    expect(after.body).toEqual({ status: "declared" });
  });

  it("changes nothing when the config was saved after the preview, and shows the change against it", async () => {
    const url = await start(project());
    await writeImport(url);
    const preview = await post(url, "/api/apis/declare/preview", IMPORT);
    const saved = `${CONFIG}// saved meanwhile\n`;
    writeFileSync(join(root, "courier.config.ts"), saved);

    const applied = await post(url, "/api/apis/declare/apply", {
      ...IMPORT,
      baseHash: preview.body.baseHash,
    });

    expect(applied.body).toMatchObject({ status: "stale", preview: { status: "ready" } });
    expect(config()).toBe(saved);
  });

  it("leaves a config it cannot add to to the developer, with the lines to add", async () => {
    const url = await start(
      project(
        'import { api } from "./src/api";\n\nconst all = () => ({ api });\n\nexport default { sources: all() };\n',
      ),
    );
    await writeImport(url);

    const preview = await post(url, "/api/apis/declare/preview", IMPORT);

    expect(preview.body).toMatchObject({
      status: "manual",
      code: "LIST_SHAPE",
      declaration: {
        source: { importLine: 'import { petstore } from "./src/gen/petstore/source";' },
      },
    });
  });

  it("puts the config back when it does not load once changed", async () => {
    const url = await start(project());
    await writeImport(url);
    const preview = await post(url, "/api/apis/declare/preview", IMPORT);
    rmSync(join(root, "src", "gen"), { recursive: true, force: true });

    const applied = await post(url, "/api/apis/declare/apply", {
      ...IMPORT,
      baseHash: preview.body.baseHash,
    });

    expect(applied.body).toMatchObject({ status: "manual", code: "NOT_LOADED" });
    expect(String(applied.body.reason)).toContain("put courier.config.ts back as it was");
    expect(config()).toBe(CONFIG);
  });

  it("refuses a caller that is not a browser page", async () => {
    const url = await start(project());

    const refused = await post(url, "/api/apis/declare/apply", { ...IMPORT, baseHash: "x" }, null);

    expect(refused.status).toBe(403);
    expect(config()).toBe(CONFIG);
  });
});
