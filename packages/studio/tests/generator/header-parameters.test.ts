/**
 * An operation's header parameters — a digest, an idempotency key, a
 * precondition — are variables of the call, validated with the rest and sent
 * as headers, so an operation that requires one can be called.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import { endpointAt, loadGenerated } from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

function header(name: string, required = false, schema: object = { type: "string" }): object {
  return { name, in: "header", required, schema };
}

function spec(origin: string): ParsedSpec {
  const thing = { $ref: "#/components/schemas/Thing" };
  const ok = { description: "ok", content: { "application/json": { schema: thing } } };
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Things", version: "1" },
      servers: [{ url: origin }],
      components: {
        schemas: {
          Thing: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
        },
      },
      paths: {
        "/things": {
          get: {
            operationId: "findThings",
            tags: ["things"],
            parameters: [
              { name: "q", in: "query", required: true, schema: { type: "string" } },
              header("X-Digest", true),
              header("X-Tags", false, { type: "array", items: { type: "string" } }),
              header("Authorization"),
              header("Accept"),
              header("q"),
            ],
            responses: { "200": ok },
          },
          post: {
            operationId: "createThing",
            tags: ["things"],
            parameters: [header("Idempotency-Key", true)],
            requestBody: { required: true, content: { "application/json": { schema: thing } } },
            responses: { "201": ok },
          },
        },
        "/things/bulk": {
          post: {
            operationId: "bulkThings",
            tags: ["things"],
            parameters: [header("X-Request-Id")],
            requestBody: {
              required: true,
              content: { "application/json": { schema: { type: "array", items: thing } } },
            },
            responses: { "200": ok },
          },
        },
      },
    }),
  );
}

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["no validation", { validation: "none" }],
];

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({ name: "chair" });
});

afterAll(async () => {
  await upstream.close();
});

function client(options: Partial<GenerateOptions>): Record<string, unknown> {
  const files = generateCode(
    spec(upstream.origin),
    { type: "openapi", outputDir: "src/api", ...options },
    "things",
  );
  return loadGenerated(files, "src/api/things/index.ts").thingsApi as Record<string, unknown>;
}

describe.each(VARIANTS)("a generated client validated with %s", (_label, options) => {
  it("sends a read's header parameters as headers, and only its query in the query", async () => {
    upstream.requests.length = 0;

    await endpointAt(
      client(options),
      "things",
      "findThings",
    )({
      q: "red",
      "X-Digest": "sha-256=abc",
      "X-Tags": ["a", "b"],
    });

    const [sent] = upstream.requests;
    expect(sent?.query).toEqual([["q", "red"]]);
    expect(sent?.headers["x-digest"]).toBe("sha-256=abc");
    expect(sent?.headers["x-tags"]).toBe("a,b");
  });

  it("sends a write's header parameter as a header, and its body without it", async () => {
    upstream.requests.length = 0;

    await endpointAt(
      client(options),
      "things",
      "createThing",
    )({ name: "chair", "Idempotency-Key": "k-1" });

    const [sent] = upstream.requests;
    expect(JSON.parse(sent?.body ?? "null")).toEqual({ name: "chair" });
    expect(sent?.headers["idempotency-key"]).toBe("k-1");
  });

  it("sends a list body whole beside a header parameter", async () => {
    upstream.requests.length = 0;

    await endpointAt(
      client(options),
      "things",
      "bulkThings",
    )({
      "X-Request-Id": "r-9",
      body: [{ name: "x" }],
    });

    const [sent] = upstream.requests;
    expect(JSON.parse(sent?.body ?? "null")).toEqual([{ name: "x" }]);
    expect(sent?.headers["x-request-id"]).toBe("r-9");
  });
});

describe("the header parameters a generated client takes", () => {
  it("leave out the ones a client sets itself, and one named like a query parameter", () => {
    const files = generateCode(
      spec("http://127.0.0.1:1"),
      { type: "openapi", outputDir: "src/api" },
      "things",
    );
    const group = files.find((file) => file.path.endsWith("things/things/index.ts"))?.content ?? "";

    expect(group).toContain('.use(headerVariablesMiddleware(["X-Digest", "X-Tags"]))');
    expect(group).toContain(
      'import { headerVariablesMiddleware } from "@noverax/courier/middleware";',
    );
    expect(group).not.toMatch(/"(Authorization|Accept)"/);
  });
});
