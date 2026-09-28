/**
 * A response body written with OpenAPI 3.1's type arrays, checked by calling
 * the generated client against a real server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { generatedCall, loadGenerated } from "../../helpers/load-generated";
import { type RecordingServer, startRecordingServer } from "../../helpers/recording-server";

const VALIDATORS = ["zod", "valibot", "arktype"] as const;

let server: RecordingServer;
let answer: unknown = null;

beforeAll(async () => {
  server = await startRecordingServer(() => ({
    contentType: "application/json",
    body: JSON.stringify(answer),
  }));
});

afterAll(async () => {
  await server.close();
});

function spec(): string {
  const ok = (schema: unknown) => ({
    "200": { description: "ok", content: { "application/json": { schema } } },
  });
  return JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Shapes", version: "1" },
    servers: [{ url: server.url }],
    paths: {
      "/nodes": {
        get: {
          tags: ["nodes"],
          operationId: "listNodes",
          responses: ok({ type: ["array", "null"], items: { $ref: "#/components/schemas/Node" } }),
        },
        patch: {
          tags: ["nodes"],
          operationId: "patchNode",
          responses: ok({ type: ["object", "null"], properties: { ok: { type: "boolean" } } }),
        },
        put: {
          tags: ["nodes"],
          operationId: "labelNode",
          responses: ok({
            allOf: [
              { $ref: "#/components/schemas/Node" },
              { type: "object", properties: { label: { type: "string" } } },
            ],
          }),
        },
      },
    },
    components: {
      schemas: {
        Node: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      },
    },
  });
}

describe.each(VALIDATORS)("a response whose type array lists null (%s)", (validation) => {
  const call = (name: string) => {
    const files = generateCode(parseSpec(spec()), { type: "openapi", outputDir: "src", validation }, "shapes");
    return generatedCall(loadGenerated(files, "src/shapes/index.ts"), ["shapesApi", "nodes", name]);
  };

  it("reads a list, and null, from an array-or-null", async () => {
    answer = [{ id: "n1" }];
    await expect(call("listNodes")()).resolves.toEqual([{ id: "n1" }]);

    answer = null;
    await expect(call("listNodes")()).resolves.toBeNull();
  });

  it("checks each element of the list", async () => {
    answer = [{ id: 1 }];

    await expect(call("listNodes")()).rejects.toThrow(/Validation failed/);
  });

  it("reads null, and the object, from an object-or-null", async () => {
    answer = null;
    await expect(call("patchNode")()).resolves.toBeNull();

    answer = { ok: true };
    await expect(call("patchNode")()).resolves.toEqual({ ok: true });
  });

  it("checks the object", async () => {
    answer = { ok: "yes" };

    await expect(call("patchNode")()).rejects.toThrow(/Validation failed/);
  });

  it("keeps what an inline allOf inherits from a component", async () => {
    answer = { id: "n1", label: "first" };

    await expect(call("labelNode")()).resolves.toEqual({ id: "n1", label: "first" });
  });
});
