/**
 * The route that reads an OpenAPI document from a source's calls: a path
 * a page recorded is read against the origin the page sends with it — an
 * http(s) origin and nothing after it, any other being ignored — and a
 * call with no address Studio can read is counted apart.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-traffic-spec-"));
  writeFileSync(join(root, "courier.config.ts"), "export default { sources: {} };\n");
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  rmSync(root, { recursive: true, force: true });
});

function start(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

const call = (url: string, origin: string | undefined, method = "get") => ({
  group: "products",
  method,
  httpMethod: "GET",
  url,
  origin,
  variables: {},
  status: 200,
  data: { id: "p_1" },
  dataCut: false,
  transport: "http",
});

async function read(calls: unknown[]) {
  const url = await start();
  const response = await fetch(`${url}/api/apis/traffic-spec`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: JSON.stringify({ source: "shop", calls }),
  });
  return (await response.json()) as {
    endpoints: number;
    document: { servers: unknown };
    leftOut: Record<string, unknown>;
  };
}

describe("POST /api/apis/traffic-spec", () => {
  it("reads paths against the origin the page sends, and counts a call it cannot address", async () => {
    const spec = await read([
      call("/api/products/p_1", "https://app.example"),
      call("/api/products", "https://app.example", "list"),
      call("products", "https://app.example", "other"),
    ]);

    expect(spec.endpoints).toBe(2);
    expect(spec.document.servers).toEqual([{ url: "https://app.example/api" }]);
    expect(spec.leftOut).toMatchObject({ unaddressed: 1 });
  });

  it("ignores an origin that is not http(s), or holds a path", async () => {
    const spec = await read([
      call("/api/products/p_1", "javascript:alert(1)"),
      call("/api/products", "https://app.example/page", "list"),
    ]);

    expect(spec.document.servers).toEqual([{ url: "/api" }]);
  });
});
