/**
 * A new project starts from a config that declares no sources yet —
 * `defineConfig({ sources: {} })`, the one the APIs page offers when there is
 * no config — and imports its first API from Studio. Studio loads that
 * config, tells the UI it loaded with no sources, answers the imports routes,
 * and writes the first import, which the config declares nowhere. Once the
 * config lists the source the import wrote, Studio shows it as imported.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadImportsState } from "../src/apis/imports-state";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { readGeneratedFile } from "../src/server/import-files/generated-header";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

const NO_SOURCES_YET =
  'import { defineConfig } from "@noverax/courier/config";\nexport default defineConfig({ sources: {} });\n';

const SPEC_TEXT = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Petstore", version: "1" },
  servers: [{ url: "https://petstore.example" }],
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        tags: ["pets"],
        responses: { "200": { description: "ok" } },
      },
    },
  },
});

/* What the import wizard sends with the defaults a user leaves alone. */
const OPTIONS = {
  sourceName: "petstore",
  outputDir: "src/api",
  validation: "none",
  groupBy: "tag",
  generateTypes: true,
  generateSchemas: false,
  addAuthMiddleware: false,
  includeComments: true,
  generateClient: "direct",
  selectedEndpoints: null,
};

let root: string;
let studio: StudioServer | undefined;
let ui: Socket | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-no-sources-")));
  symlinkSync(REPO_NODE_MODULES, join(root, "node_modules"), "dir");
  writeFileSync(join(root, "courier.config.ts"), NO_SOURCES_YET);
});

afterEach(async () => {
  ui?.disconnect();
  ui = undefined;
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function start(): Promise<string> {
  return new Promise<string>((ready, fail) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: ready,
      onError: fail,
    });
  });
}

function listen(url: string): Array<[string, unknown]> {
  const events: Array<[string, unknown]> = [];
  ui = connect(`${url}/ui`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: { Origin: url },
  });
  ui.onAny((event: string, payload: unknown) => {
    events.push([event, payload]);
  });
  return events;
}

async function until(condition: () => boolean, budgetMs = 10_000): Promise<boolean> {
  for (let waited = 0; waited < budgetMs && !condition(); waited += 25) {
    await new Promise((wake) => setTimeout(wake, 25));
  }
  return condition();
}

function latest(events: Array<[string, unknown]>, name: string): unknown {
  return events.filter(([event]) => event === name).at(-1)?.[1];
}

async function post(url: string, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileList(value: unknown): value is Array<{ path: string; content: string }> {
  return (
    Array.isArray(value) &&
    value.every((file) => isRecord(file) && typeof file.path === "string" && typeof file.content === "string")
  );
}

describe("a project whose config declares no sources yet", () => {
  it("loads, and Studio tells the UI so with no sources and no imports", async () => {
    const events = listen(await start());

    const loaded = await until(() => {
      const status = latest(events, "config:status");
      return isRecord(status) && status.state === "loaded";
    });

    expect(loaded).toBe(true);
    expect(latest(events, "config:status")).toMatchObject({ state: "loaded", configFile: "courier.config.ts" });
    expect(latest(events, "scan:sources")).toEqual({ sources: [], scannedFiles: 0 });
    expect(latest(events, "registry:updated")).toEqual({ sources: [] });
  }, 20_000);

  it("imports its first API: parse, generate and write answer, and the write records the import", async () => {
    const url = await start();

    const checks = await post(url, "/api/apis/imports/check-all", {});
    const parsed = await post(url, "/api/apis/parse", { source: "raw", content: SPEC_TEXT });
    const generated = await post(url, "/api/apis/generate", { spec: parsed.body, options: OPTIONS });
    const files = isRecord(generated.body) ? generated.body.files : undefined;
    if (!isFileList(files)) throw new Error(`generate answered ${JSON.stringify(generated.body)}`);
    const written = await post(url, "/api/apis/write", {
      sourceName: "petstore",
      spec: parsed.body,
      specUrl: "",
      importType: "raw",
      options: OPTIONS,
    });

    const paths = files.map((file) => file.path).sort();
    expect(checks).toEqual({ status: 200, body: { results: {} } });
    expect(parsed.status).toBe(200);
    expect(written.status).toBe(200);
    expect(isRecord(written.body) && Array.isArray(written.body.written) ? [...written.body.written].sort() : []).toEqual(paths);
    for (const file of files) {
      expect(readGeneratedFile(readFileSync(join(root, file.path), "utf-8")).body).toBe(file.content);
    }
    expect(Object.keys(loadImportsState(root).imports.petstore?.files ?? {}).sort()).toEqual(paths);
  }, 20_000);

  it("shows the imported source once the config lists it", async () => {
    const url = await start();
    const parsed = await post(url, "/api/apis/parse", { source: "raw", content: SPEC_TEXT });
    const generated = await post(url, "/api/apis/generate", { spec: parsed.body, options: OPTIONS });
    const files = isRecord(generated.body) ? generated.body.files : undefined;
    if (!isFileList(files)) throw new Error(`generate answered ${JSON.stringify(generated.body)}`);
    await post(url, "/api/apis/write", { sourceName: "petstore", spec: parsed.body, options: OPTIONS });
    const events = listen(url);

    writeFileSync(
      join(root, "courier.config.ts"),
      'import { defineConfig } from "@noverax/courier/config";\nimport { petstore } from "./src/api/petstore/source";\nexport default defineConfig({ sources: { petstore } });\n',
    );

    const listed = await until(() => {
      const scan = latest(events, "scan:sources");
      return isRecord(scan) && Array.isArray(scan.sources) && scan.sources.length === 1;
    });
    expect(listed).toBe(true);
    expect(latest(events, "scan:sources")).toMatchObject({
      sources: [{ name: "petstore", baseURL: "https://petstore.example", isImported: true }],
    });
  }, 20_000);
});
