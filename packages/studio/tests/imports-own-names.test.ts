/**
 * An import is found by its own name only: a name that Object.prototype
 * also carries — constructor, toString, __proto__ — finds nothing, so the
 * write route takes the raw branch, the remove route answers 404, and a
 * source of that name does not read as imported.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { setProjectRoot } from "../src/context";
import { buildSourceScan } from "../src/server/build-source-scan";
import { loadCourierConfig } from "../src/server/config-loader";
import { getImportEntry, getImportState, importsSnapshotOf } from "../src/server/imports-bridge";
import { registerRegistryRoutes } from "../src/server/registry-routes";
import type { JsonResponse, RouteApp } from "../src/server/route-types";
import { registerWriteRoutes } from "../src/server/write-routes";

type Handler = Parameters<RouteApp["post"]>[1];

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-own-names-")));
  writeFileSync(
    join(root, "courier.config.ts"),
    'export default { sources: { api: { baseURL: "https://api.example" } } };\n',
  );
  setProjectRoot(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function routes(): Map<string, Handler> {
  const found = new Map<string, Handler>();
  const app: RouteApp = { post: (path, handler) => void found.set(path, handler) };
  registerWriteRoutes(app);
  registerRegistryRoutes(app);
  return found;
}

function call(handler: Handler | undefined, body: Record<string, unknown>) {
  return new Promise<{ status: number; body: unknown }>((resolve) => {
    let status = 200;
    const res: JsonResponse = {
      status(code) {
        status = code;
        return res;
      },
      json(data) {
        resolve({ status, body: data });
      },
    };
    void handler?.({ body }, res);
  });
}

const SPEC = parseSpec(
  JSON.stringify({ openapi: "3.1.0", info: { title: "Pets", version: "1" }, paths: {} }),
);

describe("imports looked up by an Object.prototype member's name", () => {
  it("finds no declaration and no state", () => {
    const snapshot = { declarations: {}, state: { version: 1 as const, imports: {} } };

    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(getImportEntry(snapshot, name)).toBeUndefined();
      expect(getImportState(snapshot, name)).toBeUndefined();
    }
  });

  it("writes the files through the raw branch and answers 200", async () => {
    const write = routes().get("/api/apis/write");

    const reply = await call(write, {
      files: [{ path: "out/pets.ts", content: "export const pets = 1;\n" }],
      sourceName: "constructor",
      spec: SPEC,
      options: { type: "fetch" },
    });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ written: 1, merged: 0 });
    expect(readFileSync(join(root, "out/pets.ts"), "utf8")).toBe("export const pets = 1;\n");
  });

  it("answers 404 when asked to remove one", async () => {
    const remove = routes().get("/api/apis/imports/remove");

    const reply = await call(remove, { name: "constructor" });

    expect(reply.status).toBe(404);
    expect(existsSync(join(root, ".courier", "imports-state.json"))).toBe(false);
  });

  it("does not count a source named after one as imported", async () => {
    writeFileSync(
      join(root, "courier.config.ts"),
      'export default { sources: { constructor: { baseURL: "https://api.example" } } };\n',
    );

    const loaded = await loadCourierConfig(root);
    const { sources } = buildSourceScan(loaded, importsSnapshotOf(loaded.config.imports, root), root);

    expect(sources.map((source) => [source.name, source.isImported])).toEqual([
      ["constructor", false],
    ]);
  });
});
