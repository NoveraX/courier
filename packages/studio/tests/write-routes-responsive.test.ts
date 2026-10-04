/**
 * Studio keeps answering while it writes a large import. Flushed to disk one
 * file and one folder after another on the thread that serves everything
 * else, a write of a few hundred groups would hold the whole server for
 * seconds — no API answer, no socket message — and one past Socket.IO's ping
 * window would drop every runtime and UI.
 */
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const GROUPS = 300;

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-write-responsive-")));
  writeFileSync(join(root, "courier.config.ts"), "export default { sources: {} };\n");
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function manyGroups(): unknown {
  const paths: Record<string, unknown> = {};
  for (let i = 0; i < GROUPS; i++) {
    paths[`/g${i}/items`] = {
      get: {
        operationId: `list${i}`,
        tags: [`g${i}`],
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { $ref: `#/components/schemas/Item${i}` } } },
          },
        },
      },
    };
  }
  const schemas = Object.fromEntries(
    Array.from({ length: GROUPS }, (_, i) => [
      `Item${i}`,
      { type: "object", properties: { id: { type: "integer" } } },
    ]),
  );
  return parseSpec(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Many", version: "1" },
      paths,
      components: { schemas },
    }),
  );
}

/* An apply in progress keeps its journal in .courier/journal until it is done. */
function applying(): boolean {
  const journals = join(root, ".courier/journal");
  return existsSync(journals) && readdirSync(journals).some((name) => name.endsWith(".json"));
}

describe("writing an import of hundreds of groups", () => {
  it("answers another request while the files are being written", async () => {
    const url = await new Promise<string>((resolve, reject) => {
      studio = createStudioServer({
        port: 0,
        host: "127.0.0.1",
        projectRoot: root,
        onReady: resolve,
        onError: reject,
      });
    });
    const headers = { "content-type": "application/json", origin: url, ...tokenHeader(studio) };
    const body = JSON.stringify({
      sourceName: "many",
      spec: manyGroups(),
      options: { type: "openapi", outputDir: "src/api", sourceName: "many" },
    });
    let writtenAt = Number.POSITIVE_INFINITY;

    const writing = fetch(`${url}/api/apis/write`, { method: "POST", headers, body }).then(
      (response) => {
        writtenAt = performance.now();
        return response;
      },
    );
    /* Asked while the apply runs — seen only if the server can look up from it. */
    const answeredAt = await new Promise<number | "never asked">((resolve) => {
      const poll = setInterval(() => {
        if (!applying()) return;
        clearInterval(poll);
        void fetch(`${url}/api/health`, { headers: { origin: url } }).then(() =>
          resolve(performance.now()),
        );
      }, 5);
      void writing.then(() => {
        clearInterval(poll);
        setTimeout(() => resolve("never asked"), 50);
      });
    });
    const written = await writing;

    expect(written.status).toBe(200);
    expect(readdirSync(join(root, "src/api/many")).length).toBeGreaterThan(GROUPS);
    expect(answeredAt).not.toBe("never asked");
    expect(answeredAt).toBeLessThan(writtenAt);
  }, 60_000);
});
