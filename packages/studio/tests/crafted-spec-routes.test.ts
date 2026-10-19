/**
 * A specification sent to Studio, crafted with a name that would be
 * written as code, is refused with 400 and the field it holds — sent to
 * generate from with the project's token, generated here, and without it,
 * in a process of its own; sent to write, with nothing written — and no
 * code is answered with it. A write the generator fails on by itself is
 * refused with 400 too. The case without the token runs in Studio's worker,
 * which is Studio's built `lib`: build it before running this file.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonText } from "../src/apis/registry/json-text";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const INJECTED = "Node = 1 as never; globalThis.pwned = 1; export const Evil";
const CONFIG = 'export default { sources: { api: { baseURL: "https://api.example" } } };\n';

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = mkdtempSync(join(tmpdir(), "courier-crafted-spec-"));
  writeFileSync(join(root, "courier.config.ts"), CONFIG);
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
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

const CRAFTED = {
  title: "Shop",
  version: "1",
  description: "",
  baseURL: "https://shop.example",
  format: "openapi3",
  groups: [],
  schemas: { [INJECTED]: { name: "Owner", type: "object", properties: {} } },
  securitySchemes: [],
  skipped: [],
};
const OPTIONS = { type: "openapi", outputDir: "src/api", sourceName: "shop" };

async function post(url: string, path: string, body: unknown, withToken: boolean) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: url,
      ...(withToken ? tokenHeader(studio) : {}),
    },
    body: jsonText(body) ?? "",
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("a crafted specification sent to generate from", () => {
  it.each([
    ["with the project's token, generating here", true, undefined],
    ["without it, generating in a process of its own", false, "CODE_NOT_GENERATED"],
  ])("is refused %s, naming the field, with no code", async (_who, withToken, code) => {
    const url = await start();

    const { status, body } = await post(
      url,
      "/api/apis/generate",
      { spec: CRAFTED, options: OPTIONS },
      withToken,
    );

    expect(status).toBe(400);
    expect(body.code).toBe(code);
    expect(body.files).toBeUndefined();
    expect(String(body.error)).toContain("The specification's schemas");
    expect(String(body.error)).toContain("is refused");
  });
});

describe("a crafted specification sent to write", () => {
  it("is refused with INVALID_SPEC, naming the field, and nothing is written", async () => {
    const url = await start();

    const { status, body } = await post(
      url,
      "/api/apis/write",
      { sourceName: "shop", spec: CRAFTED, options: OPTIONS },
      true,
    );

    expect(status).toBe(400);
    expect(body.code).toBe("INVALID_SPEC");
    expect(String(body.error)).toContain("The specification's schemas");
    expect(existsSync(join(root, "src"))).toBe(false);
    expect(readFileSync(join(root, "courier.config.ts"), "utf8")).toBe(CONFIG);
  });

  it("is refused with SPEC_NOT_GENERATED when the generator fails on it, and nothing is written", async () => {
    const url = await start();
    const failing = {
      ...CRAFTED,
      schemas: { Owner: { name: "Owner", type: "object", properties: {}, required: 5 } },
      groups: [
        {
          name: "owners",
          description: "",
          prefix: "/owners",
          endpoints: [
            {
              name: "getOwner",
              operationId: "getOwner",
              httpMethod: "get",
              path: "",
              fullPath: "/owners",
              description: "",
              secured: false,
              requestBody: null,
              parameters: [],
              responseSchema: { name: "Owner", type: "object", properties: {}, required: 5 },
              tags: ["owners"],
            },
          ],
        },
      ],
    };

    const { status, body } = await post(
      url,
      "/api/apis/write",
      { sourceName: "shop", spec: failing, options: OPTIONS },
      true,
    );

    expect(status).toBe(400);
    expect(body.code).toBe("SPEC_NOT_GENERATED");
    expect(existsSync(join(root, "src"))).toBe(false);
    expect(readFileSync(join(root, "courier.config.ts"), "utf8")).toBe(CONFIG);
  });
});

describe("a specification nested deeper than JSON.stringify's recursion goes, sent to write", () => {
  it("is hashed and written, where hashing it answered 500", async () => {
    const url = await start();
    let shape: Record<string, unknown> = { name: "Leaf", type: "string" };
    for (let depth = 0; depth < 20_000; depth += 1) {
      shape = {
        name: `Level${depth}`,
        type: "object",
        properties: { next: { required: false, type: "object", shape } },
        required: [],
      };
    }
    const deep = { ...CRAFTED, schemas: { Deep: shape } };

    const { status, body } = await post(
      url,
      "/api/apis/write",
      { sourceName: "shop", spec: deep, options: OPTIONS },
      true,
    );

    expect(status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(existsSync(join(root, "src/api/shop/source.ts"))).toBe(true);
  });
});
