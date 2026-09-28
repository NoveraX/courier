/**
 * A specification Studio parses can be sent back to it: generate, write,
 * update and manage all take the parsed specification in their body. Parse
 * read specifications up to 64 MB while those routes took bodies up to
 * 5 MB, so a large real API parsed and could then never be written.
 */
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-body-limit-")));
  writeFileSync(join(root, "courier.config.ts"), "export default { sources: {} };\n");
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function start(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
}

/* A specification of about `megabytes` once parsed: many endpoints, each with a long description. */
function largeSpec(megabytes: number): string {
  const paths: Record<string, unknown> = {};
  const description = "d".repeat(10_000);
  for (let i = 0; i < megabytes * 100; i++) {
    paths[`/items${i}`] = { get: { operationId: `getItem${i}`, tags: ["items"], description, responses: { "200": { description: "ok" } } } };
  }
  return JSON.stringify({ openapi: "3.1.0", info: { title: "Large", version: "1" }, paths });
}

describe("a specification of several megabytes once parsed", () => {
  it("is parsed, and written from what parse answered", async () => {
    const url = await start();
    const headers = { "content-type": "application/json", origin: url };

    const parsed = await fetch(`${url}/api/apis/parse`, {
      method: "POST",
      headers,
      body: JSON.stringify({ source: "raw", content: largeSpec(7) }),
    });
    expect(parsed.status).toBe(200);
    const spec: unknown = await parsed.json();
    expect(JSON.stringify(spec).length).toBeGreaterThan(6 * 1024 * 1024);

    const written = await fetch(`${url}/api/apis/write`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sourceName: "large", spec, options: { type: "openapi", outputDir: "src/api", sourceName: "large" } }),
    });

    expect(written.status).toBe(200);
    expect(readdirSync(join(root, "src/api/large"))).toContain("source.ts");
  }, 60_000);

  it("parses to the same specification Studio's parser gives", () => {
    expect(parseSpec(largeSpec(1)).groups[0]?.endpoints).toHaveLength(100);
  });
});
