/**
 * A named body on a reference cycle is written lazily, typed as a plain
 * schema that has nothing to extend it with, so the parameters beside it are
 * intersected with it instead — and the client compiles and validates.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import {
  compileProject,
  endpointAt,
  loadGenerated,
  removeProjects,
  writeProject,
} from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Tree", version: "1" },
      servers: [{ url: origin }],
      paths: {
        "/trees/{treeId}": {
          put: {
            operationId: "replaceTree",
            tags: ["trees"],
            parameters: [
              { name: "treeId", in: "path", required: true, schema: { type: "integer" } },
            ],
            requestBody: {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Node" } } },
            },
            responses: { "200": { description: "ok" } },
          },
        },
      },
      components: {
        schemas: {
          Node: {
            type: "object",
            required: ["label"],
            properties: {
              label: { type: "string" },
              children: { type: "array", items: { $ref: "#/components/schemas/Node" } },
            },
          },
        },
      },
    }),
  );
}

const CONSUMER = `import { treeApi } from "./src/api/tree";

export async function calls(): Promise<void> {
  await treeApi.trees.replaceTree({ treeId: 1, label: "root", children: [{ label: "leaf" }] });
  // @ts-expect-error a child has a label
  await treeApi.trees.replaceTree({ treeId: 1, label: "root", children: [{}] });
}
`;

let server: UpstreamServer;

beforeAll(async () => {
  server = await startUpstreamServer({});
});

afterAll(async () => {
  await server.close();
  removeProjects("cyclic-body");
});

describe.each(["zod", "valibot", "arktype"] as const)(
  "a body on a cycle, with %s",
  (validation) => {
    const generate = () =>
      generateCode(
        spec(server.origin),
        { type: "openapi", outputDir: "src/api", validation },
        "tree",
      );

    it("compiles beside a path parameter", () => {
      const dir = writeProject(`cyclic-body/${validation}`, generate(), {
        "consumer.ts": CONSUMER,
      });

      expect(compileProject(dir, ["consumer.ts"])).toEqual([]);
    }, 60_000);

    it("sends the body, the parameter in the path", async () => {
      const { treeApi } = loadGenerated(generate(), "src/api/tree/index.ts");
      server.requests.length = 0;

      await endpointAt(treeApi, "trees", "replaceTree")({ treeId: 1, label: "root", children: [] });

      expect(server.requests.map((r) => `${r.method} ${r.path} ${r.body}`)).toEqual([
        'PUT /trees/1 {"label":"root","children":[]}',
      ]);
    });
  },
);
