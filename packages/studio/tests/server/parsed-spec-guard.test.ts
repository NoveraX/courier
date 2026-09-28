/**
 * A spec the parser produced is taken back by the routes that write from it,
 * whatever verbs its endpoints use.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStudioServer } from "../../src/server/create-studio-server";
import type { StudioServer } from "../../src/server/types";
import { tokenHeader } from "../helpers/token-header";

const CONFIG = 'export default { sources: { api: { baseURL: "https://api.example" } } };\n';

const SPEC = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Files", version: "1" },
  servers: [{ url: "https://files.example" }],
  paths: {
    "/files/{id}": {
      head: {
        tags: ["files"],
        operationId: "fileExists",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "ok" } },
      },
      get: {
        tags: ["files"],
        operationId: "getFile",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "ok" } },
      },
    },
  },
});

let root: string;
let studio: StudioServer | undefined;
let url: string;

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-head-spec-")));
  writeFileSync(join(root, "courier.config.ts"), CONFIG);
  url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}, 30_000);

afterAll(async () => {
  await studio?.close();
  rmSync(root, { recursive: true, force: true });
});

async function post(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

describe("a parsed spec with a HEAD endpoint", () => {
  it("is written, HEAD endpoint and all", async () => {
    const parsed = await post("/api/apis/parse", { source: "raw", content: SPEC });
    expect(parsed.status).toBe(200);

    const written = await post("/api/apis/write", {
      sourceName: "files",
      spec: parsed.body,
      options: { type: "openapi", outputDir: "src/api", sourceName: "files" },
    });

    expect(written.status).toBe(200);
    const group = readFileSync(join(root, "src/api/files/files/index.ts"), "utf8");
    expect(group).toContain('fileExists: endpoint.head(":id")');
  }, 20_000);
});
