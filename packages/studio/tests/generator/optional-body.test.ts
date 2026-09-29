/**
 * A body that is a list, a scalar or a map, which the operation does not
 * require — OpenAPI's default — used to be generated as a variable every
 * call had to pass. It may now be left out, and a call without it sends no
 * body; a body the operation requires is still demanded.
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

const tags = { type: "array", items: { type: "string" } };

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Tags", version: "1" },
      servers: [{ url: origin }],
      paths: {
        "/tags": {
          put: {
            operationId: "setTags",
            tags: ["tags"],
            requestBody: { content: { "application/json": { schema: tags } } },
            responses: { "204": { description: "done" } },
          },
        },
        "/tags/{id}": {
          put: {
            operationId: "setItemTags",
            tags: ["tags"],
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            requestBody: { content: { "application/json": { schema: tags } } },
            responses: { "204": { description: "done" } },
          },
        },
        "/required": {
          post: {
            operationId: "mustSend",
            tags: ["tags"],
            requestBody: { required: true, content: { "application/json": { schema: tags } } },
            responses: { "204": { description: "done" } },
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

const CONSUMER = `import { tagsApi } from "./src/api/tags";

export async function use(): Promise<void> {
  await tagsApi.tags.setTags();
  await tagsApi.tags.setItemTags({ id: "1" });
  // @ts-expect-error — the operation requires its body
  await tagsApi.tags.mustSend();
}
`;

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({});
});

afterAll(async () => {
  await upstream.close();
  removeProjects("optional-body");
});

describe.each(VARIANTS)("a generated client validated with %s", (label, options) => {
  const files = (): ReturnType<typeof generateCode> =>
    generateCode(
      spec(upstream.origin),
      { type: "openapi", outputDir: "src/api", ...options },
      "tags",
    );

  it("leaves out a body the operation does not require, sending none", async () => {
    const { tagsApi } = loadGenerated(files(), "src/api/tags/index.ts");
    upstream.requests.length = 0;

    await endpointAt(tagsApi, "tags", "setTags")();
    await endpointAt(tagsApi, "tags", "setItemTags")({ id: "1" });

    expect(upstream.requests.map((request) => [request.path, request.body])).toEqual([
      ["/tags", ""],
      ["/tags/1", ""],
    ]);
  });

  it("types the body as optional where it is, and demanded where it is not", () => {
    const dir = writeProject(`optional-body/${label.replace(/ /g, "-")}`, files(), {
      "consumer.ts": CONSUMER,
    });

    expect(compileProject(dir, ["consumer.ts"], STRICT)).toEqual([]);
  }, 60_000);
});
