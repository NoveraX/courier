/**
 * Managing an import's endpoints names only endpoints its files hold: an
 * endpoint to remove that the files do not hold, and one to add that the
 * spec does not generate, are both refused with 400, not planned as a change
 * that changes nothing.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
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
    },
  }),
);
const CONFIG =
  'export default { sources: { api: { baseURL: "https://api.example" } }, imports: { pets: { importType: "file", type: "openapi", outputDir: "src/api" } } };\n';

let root: string;
let studio: StudioServer | undefined;
let url: string;

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-manage-plan-")));
  mkdirSync(dirname(join(root, "courier.config.ts")), { recursive: true });
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
  const written = await post("/api/apis/write", {
    sourceName: "pets",
    spec: SPEC,
    options: { type: "openapi", outputDir: "src/api", sourceName: "pets" },
  });
  expect(written.status).toBe(200);
}, 30_000);

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
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

describe("removing an endpoint the import's files do not hold", () => {
  it.each([
    ["a group the import has not", { nogroup: ["x"] }, "nogroup.x"],
    ["an endpoint its group has not", { pets: ["nosuch"] }, "pets.nosuch"],
  ])("is refused 400 for %s, by preview and by apply", async (_label, toRemove, named) => {
    const preview = await post("/api/apis/manage/preview", { name: "pets", spec: SPEC, toRemove });
    const apply = await post("/api/apis/manage/apply", {
      name: "pets",
      spec: SPEC,
      toRemove,
      planDigest: "x",
    });

    for (const reply of [preview, apply]) {
      expect(reply.status).toBe(400);
      expect(reply.body).toEqual({
        error: `The import's files hold no endpoint ${named} to remove`,
      });
    }
  });

  it("is planned for one its files hold", async () => {
    const preview = await post("/api/apis/manage/preview", {
      name: "pets",
      spec: SPEC,
      toRemove: { pets: ["createPet"] },
    });

    expect(preview.status).toBe(200);
  });
});
