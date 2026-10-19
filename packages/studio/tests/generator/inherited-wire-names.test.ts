/**
 * A parameter or a field named like a member every object inherits —
 * `constructor`, `toString`, `__proto__` — is one like any other. The
 * closure reads the caller's own values only: read from the variables, an
 * absent `constructor` gave `function Object()…`, which went out as the
 * query parameter, and an absent `__proto__` the variables' prototype. An
 * object type takes an object that leaves such an optional field out:
 * TypeScript reads `Object`'s member on every object, so the call did not
 * compile without it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import {
  compileProject,
  endpointAt,
  loadGenerated,
  removeProjects,
  STRICT,
  writeProject,
} from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const query = (name: string, schema: object = { type: "string" }) => ({
  name,
  in: "query",
  schema,
});

function spec(origin: string): ParsedSpec {
  const thing = { $ref: "#/components/schemas/Thing" };
  const ok = { description: "ok", content: { "application/json": { schema: thing } } };
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Shop", version: "1" },
      servers: [{ url: origin }],
      components: {
        schemas: {
          Thing: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
              constructor: { type: "string" },
              toString: { type: "string" },
              valueOf: { type: "number" },
            },
          },
        },
      },
      paths: {
        "/things/{id}": {
          put: {
            operationId: "putThing",
            tags: ["things"],
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "string" } },
              query("constructor"),
              query("__proto__"),
            ],
            requestBody: { required: true, content: { "application/json": { schema: thing } } },
            responses: { "200": ok },
          },
        },
      },
    }),
  );
}

const CONSUMER = [
  'import { shopApi } from "./src/api/shop";',
  'import type { Thing } from "./src/api/shop";',
  "",
  'export const thing: Thing = { id: "a" };',
  'export const named: Thing = { id: "a", constructor: "b", toString: "c", valueOf: 1 };',
  'export const sent = shopApi.things.putThing({ id: "1", body: { id: "a" } });',
  "export function read(found: Thing): string | undefined {",
  '  return typeof found.constructor === "string" ? found.constructor : undefined;',
  "}",
  "",
].join("\n");

const OPTIONS: Partial<GenerateOptions> = { validation: "none" };

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({ id: "a" });
});

afterAll(async () => {
  await upstream.close();
  removeProjects("inherited-wire-names");
});

function files() {
  return generateCode(
    spec(upstream.origin),
    { type: "openapi", outputDir: "src/api", ...OPTIONS },
    "shop",
  );
}

describe("a generated client whose names every object inherits", () => {
  it("sends no query parameter the caller left out", async () => {
    upstream.requests.length = 0;
    const putThing = endpointAt(
      loadGenerated(files(), "src/api/shop/index.ts").shopApi,
      "things",
      "putThing",
    );

    await putThing({ id: "1", body: { id: "a" } });

    const [sent] = upstream.requests;
    expect(sent?.path).toBe("/things/1");
    expect(sent?.query).toEqual([]);
    expect(JSON.parse(sent?.body ?? "null")).toEqual({ id: "a" });
  });

  it("sends each one the caller gave, under its own name", async () => {
    upstream.requests.length = 0;
    const putThing = endpointAt(
      loadGenerated(files(), "src/api/shop/index.ts").shopApi,
      "things",
      "putThing",
    );

    await putThing(
      JSON.parse('{ "id": "1", "constructor": "c", "__proto__": "p", "body": { "id": "a" } }'),
    );

    const [sent] = upstream.requests;
    expect(sent?.query).toEqual([
      ["constructor", "c"],
      ["__proto__", "p"],
    ]);
  });

  it("compiles a call that leaves the optional ones out, under strict and exact optional types", () => {
    const dir = writeProject("inherited-wire-names/none", files(), { "consumer.ts": CONSUMER });

    expect(compileProject(dir, ["consumer.ts"])).toEqual([]);
    expect(
      compileProject(dir, ["consumer.ts"], { ...STRICT, exactOptionalPropertyTypes: true }),
    ).toEqual([]);
  }, 60_000);
});
