/**
 * An import is found by its own name only: a name that Object.prototype
 * also carries — constructor, toString, __proto__ — finds nothing, so the
 * write route writes it as a new import, the remove route answers 404, and
 * a source of that name does not read as imported.
 */
import { EventEmitter } from "node:events";
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

import { IMPORTS_STATE_VERSION, loadImportsState } from "../src/apis/imports-state";
import { parseSpec } from "../src/apis/parser/parse-spec";
import type { ApisRouteApp } from "../src/server/apis-routes";
import { buildSourceScan } from "../src/server/build-source-scan";
import { loadCourierConfig } from "../src/server/config-loader";
import { getImportEntry, getImportState, importsSnapshotOf } from "../src/server/imports-bridge";
import type { ProjectSnapshot, ProjectState } from "../src/server/project-state/types";
import { registerRegistryRoutes } from "../src/server/registry-routes";
import type { WorkedResponse } from "../src/server/request-work";
import type { JsonResponse } from "../src/server/route-types";
import { createUpdateChecks } from "../src/server/update-checks";
import { registerWriteRoutes } from "../src/server/write-routes";

type Handler = Parameters<ApisRouteApp["post"]>[1];

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-own-names-")));
  writeFileSync(
    join(root, "courier.config.ts"),
    'export default { sources: { api: { baseURL: "https://api.example" } } };\n',
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/* The routes as Studio mounts them, over the project as it runs the config on disk now. */
async function routes(): Promise<Map<string, Handler>> {
  const view: ProjectSnapshot = {
    revision: 1,
    starting: false,
    running: await loadCourierConfig(root),
    loadedAt: Date.now(),
    failure: null,
  };
  const project: ProjectState = {
    snapshot: () => view,
    fresh: async () => ({ ...view, settling: false }),
    importsChanged: () => undefined,
    updateChecks: createUpdateChecks(),
    runExclusive: () => Promise.reject(new Error("no config edit in these tests")),
    finishEdits: async () => undefined,
    stop: () => undefined,
  };
  const found = new Map<string, Handler>();
  const app: ApisRouteApp = { post: (path, handler) => void found.set(path, handler) };
  registerWriteRoutes(app, { project, projectRoot: root });
  registerRegistryRoutes(app, { project, projectRoot: root });
  return found;
}

function call(handler: Handler | undefined, body: Record<string, unknown>) {
  return new Promise<{ status: number; body: unknown }>((resolve) => {
    let status = 200;
    const res: JsonResponse & WorkedResponse = Object.assign(new EventEmitter(), {
      writableFinished: false,
      end: () => undefined,
      status(code: number) {
        status = code;
        return res;
      },
      json(data: unknown) {
        resolve({ status, body: data });
      },
    });
    void handler?.({ body }, res);
  });
}

const SPEC = parseSpec(
  JSON.stringify({ openapi: "3.1.0", info: { title: "Pets", version: "1" }, paths: {} }),
);

describe("imports looked up by an Object.prototype member's name", () => {
  it("finds no declaration and no state", () => {
    const snapshot = {
      declarations: {},
      state: { version: IMPORTS_STATE_VERSION, imports: {}, applied: [] },
    };

    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(getImportEntry(snapshot, name)).toBeUndefined();
      expect(getImportState(snapshot, name)).toBeUndefined();
    }
  });

  it("writes one as a new import and records it under its own name", async () => {
    const write = (await routes()).get("/api/apis/write");

    const reply = await call(write, {
      sourceName: "constructor",
      spec: SPEC,
      options: { type: "openapi", outputDir: "out", sourceName: "constructor" },
    });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      written: expect.arrayContaining(["out/constructor/source.ts"]),
    });
    expect(readFileSync(join(root, "out/constructor/source.ts"), "utf8")).toContain(
      "export const constructor",
    );
    expect(Object.keys(loadImportsState(root).imports)).toEqual(["constructor"]);
  });

  it("answers 404 when asked to remove one", async () => {
    const remove = (await routes()).get("/api/apis/imports/remove");

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
    const { sources } = buildSourceScan(
      loaded,
      importsSnapshotOf(loaded.config.imports, root),
      root,
    );

    expect(sources.map((source) => [source.name, source.isImported])).toEqual([
      ["constructor", false],
    ]);
  });
});
