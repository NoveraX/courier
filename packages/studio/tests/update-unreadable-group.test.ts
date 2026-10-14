/**
 * An update that meets a group file Studio cannot read as code — the user
 * saved it mid-edit — leaves the file as it is unless the user allows it to
 * be replaced: merged line by line, such a file would get endpoints written
 * twice, keep one the spec dropped and keep the broken line, with no
 * question asked.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseSource } from "@noverax/courier-cli/devkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

function petsSpec(version: string, operations: Record<string, Record<string, string>>): unknown {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, methods] of Object.entries(operations)) {
    paths[path] = {};
    for (const [method, operationId] of Object.entries(methods)) {
      paths[path][method] = {
        operationId,
        tags: ["pets"],
        responses: { "200": { description: "ok" } },
      };
    }
  }
  return parseSpec(JSON.stringify({ openapi: "3.1.0", info: { title: "Pets", version }, paths }));
}

const V1 = petsSpec("1", {
  "/pets": { get: "listPets", post: "createPet" },
  "/pets/{id}": { get: "getPet" },
});
const V2 = petsSpec("2", {
  "/pets": { get: "listPets", post: "createPet" },
  "/pets/{id}/photo": { get: "getPetPhoto" },
});
const CONFIG =
  'export default { sources: { api: { baseURL: "https://api.example" } }, imports: { pets: { importType: "file", type: "openapi", outputDir: "src/api" } } };\n';
const GROUP = "src/api/pets/pets/index.ts";
const BROKEN_LINE = '    broken: endpoint.get("x".response<unknown>(),';

let root: string;
let studio: StudioServer | undefined;
let url: string;

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-update-unreadable-")));
  put("courier.config.ts", CONFIG);
  url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
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

interface Plan {
  digest: string;
  writes: unknown[];
  pending: unknown[];
}

function planOf(reply: { body: Record<string, unknown> }): Plan {
  const plan = reply.body.plan;
  if (typeof plan !== "object" || plan === null)
    throw new Error(`no plan in ${JSON.stringify(reply.body)}`);
  const { digest, writes, pending } = {
    digest: undefined,
    writes: undefined,
    pending: undefined,
    ...plan,
  };
  if (typeof digest !== "string" || !Array.isArray(writes) || !Array.isArray(pending)) {
    throw new Error(`not a plan: ${JSON.stringify(plan)}`);
  }
  return { digest, writes, pending };
}

/** Import v1, then leave the group file half edited: a custom endpoint and one unclosed call. */
async function importAndBreak(): Promise<string> {
  const written = await post("/api/apis/write", {
    sourceName: "pets",
    spec: V1,
    options: { type: "openapi", outputDir: "src/api", sourceName: "pets" },
  });
  expect(written.status).toBe(200);
  const edited = read(GROUP).replace(
    "  endpoints: {\n",
    `  endpoints: {\n    mine: endpoint.get("/mine").response<unknown>(),\n${BROKEN_LINE}\n`,
  );
  expect(parseSource("index.ts", edited).problem).not.toBeNull();
  put(GROUP, edited);
  return edited;
}

describe("updating an import whose group file does not parse", () => {
  it("asks before replacing the file instead of merging into it", async () => {
    await importAndBreak();

    const preview = await post("/api/apis/update/preview", { name: "pets", newSpec: V2 });

    expect(preview.status).toBe(200);
    const plan = planOf(preview);
    expect(plan.writes).not.toContainEqual(expect.objectContaining({ path: GROUP }));
    expect(plan.pending).toContainEqual(expect.objectContaining({ path: GROUP, kind: "replace" }));
  });

  it("leaves the file as the user left it when the replace is not allowed", async () => {
    const edited = await importAndBreak();
    const preview = await post("/api/apis/update/preview", { name: "pets", newSpec: V2 });

    const applied = await post("/api/apis/update/apply", {
      name: "pets",
      newSpec: V2,
      planDigest: planOf(preview).digest,
      confirm: [],
    });

    expect(applied.status).toBe(200);
    expect(read(GROUP)).toBe(edited);
  });

  it("writes the generated group, which parses, once the replace is allowed", async () => {
    await importAndBreak();
    const preview = await post("/api/apis/update/preview", { name: "pets", newSpec: V2 });

    const applied = await post("/api/apis/update/apply", {
      name: "pets",
      newSpec: V2,
      planDigest: planOf(preview).digest,
      confirm: [GROUP],
    });

    expect(applied.status).toBe(200);
    const text = read(GROUP);
    expect(parseSource("index.ts", text).problem).toBeNull();
    expect(text).toContain("getPetPhoto");
    expect(text).not.toContain("getPet:");
    expect(text.match(/listPets:/g)).toHaveLength(1);
  });
});
