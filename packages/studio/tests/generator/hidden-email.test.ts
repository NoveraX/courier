/**
 * An answer with an address the API keeps private. Gitea describes a user's
 * `email` as `format: email`, yet answers a repository with its owner's
 * `email: ""` when the owner hides it; every validator checked the address,
 * and the whole answer was refused.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import { endpointAt, loadGenerated } from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const User = {
  type: "object",
  required: ["login", "email"],
  properties: { login: { type: "string" }, email: { type: "string", format: "email" } },
};

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Hub", version: "1" },
      servers: [{ url: origin }],
      components: { schemas: { User } },
      paths: {
        "/users/{username}": {
          get: {
            operationId: "getUser",
            tags: ["users"],
            parameters: [
              { name: "username", in: "path", required: true, schema: { type: "string" } },
            ],
            responses: {
              "200": {
                description: "ok",
                content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
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
  upstream = await startUpstreamServer({ login: "gitea", email: "" });
});

afterAll(async () => {
  await upstream.close();
});

describe.each(VARIANTS)("a generated client validated with %s", (_label, options) => {
  it("reads an answer whose address the API left empty", async () => {
    const files = generateCode(
      spec(upstream.origin),
      { type: "openapi", outputDir: "src/api", ...options },
      "hub",
    );
    const { hubApi } = loadGenerated(files, "src/api/hub/index.ts");

    const user = await endpointAt(hubApi, "users", "getUser")({ username: "gitea" });

    expect(user).toEqual({ login: "gitea", email: "" });
  });
});
