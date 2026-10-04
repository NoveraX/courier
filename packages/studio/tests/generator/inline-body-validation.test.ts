/**
 * An endpoint whose body's fields are written in the operation itself has
 * its variables extracted as a type, with a schema beside it — and the
 * schema validates the call, as a named body's does, rather than sitting
 * unused in every client while the call goes out unchecked.
 */

import { isValidationError } from "@noverax/courier";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import { endpointAt, loadGenerated } from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Pets", version: "1" },
      servers: [{ url: origin }],
      paths: {
        "/pets/{id}": {
          put: {
            operationId: "updatePet",
            tags: ["pets"],
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "string" } },
              { name: "dryRun", in: "query", schema: { type: "boolean" } },
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: { name: { type: "string" }, age: { type: "integer" } },
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "ok",
                content: { "application/json": { schema: { type: "object" } } },
              },
            },
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
];

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({ ok: true });
});

afterAll(async () => {
  await upstream.close();
});

describe.each(VARIANTS)("a generated client validated with %s", (_label, options) => {
  function updatePet() {
    const files = generateCode(
      spec(upstream.origin),
      { type: "openapi", outputDir: "src/api", ...options },
      "pets",
    );
    const { petsApi } = loadGenerated(files, "src/api/pets/index.ts");
    return endpointAt(petsApi, "pets", "updatePet");
  }

  it("refuses fields written in the operation that its schema does not take, before sending", async () => {
    upstream.requests.length = 0;

    const failure = await updatePet()({ id: "7", name: 42 }).catch((error: unknown) => error);

    expect(isValidationError(failure)).toBe(true);
    expect(upstream.requests).toEqual([]);
  });

  it("sends the fields, the path and the query where each goes", async () => {
    upstream.requests.length = 0;

    await updatePet()({ id: "7", dryRun: true, name: "Rex", age: 3 });

    const [request] = upstream.requests;
    expect([request?.path, request?.query, JSON.parse(request?.body ?? "null")]).toEqual([
      "/pets/7",
      [["dryRun", "true"]],
      { name: "Rex", age: 3 },
    ]);
  });
});
