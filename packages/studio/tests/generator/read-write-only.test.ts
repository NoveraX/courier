/**
 * One schema describes both what is sent and what comes back. A readOnly
 * field is only answered and a writeOnly one only sent, so a required
 * writeOnly `password` made every answer of the schema fail validation — the
 * server never sends it back — and a required readOnly `id` made a request
 * body impossible to build.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import { endpointAt, loadGenerated } from "../helpers/generated-project";
import { type UpstreamServer, startUpstreamServer } from "../helpers/upstream-server";

function spec(origin: string): ParsedSpec {
  const user = { $ref: "#/components/schemas/User" };
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Users", version: "1" },
      servers: [{ url: origin }],
      components: {
        schemas: {
          User: {
            type: "object",
            required: ["id", "email", "password"],
            properties: {
              id: { type: "string", readOnly: true },
              email: { type: "string" },
              password: { type: "string", writeOnly: true },
            },
          },
        },
      },
      paths: {
        "/users": {
          post: {
            operationId: "createUser",
            tags: ["users"],
            requestBody: { required: true, content: { "application/json": { schema: user } } },
            responses: { "201": { description: "created", content: { "application/json": { schema: user } } } },
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
  upstream = await startUpstreamServer({ id: "u1", email: "ada@example.com" });
});

afterAll(async () => {
  await upstream.close();
});

describe.each(VARIANTS)("a generated client validated with %s", (_label, options) => {
  it("sends a body without the field the server assigns, and reads an answer without the one it never returns", async () => {
    const files = generateCode(spec(upstream.origin), { type: "openapi", outputDir: "src/api", ...options }, "users");
    const { usersApi } = loadGenerated(files, "src/api/users/index.ts");
    upstream.requests.length = 0;

    const created = await endpointAt(usersApi, "users", "createUser")({ email: "ada@example.com", password: "s3cret" });

    expect(created).toEqual({ id: "u1", email: "ada@example.com" });
    expect(JSON.parse(upstream.requests[0]?.body ?? "null")).toEqual({ email: "ada@example.com", password: "s3cret" });
  });
});
