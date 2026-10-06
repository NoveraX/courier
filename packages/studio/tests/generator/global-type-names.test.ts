/**
 * Generated code names the platform's types — `Blob` for bytes sent or
 * read, `FormData` for a multipart form, an object of any keys — in a way a
 * schema of the same name cannot take over: GitHub's specification has a
 * schema called `Blob`, and a schema imported into a file under that name
 * stood in for the platform's, so a file upload no longer compiled.
 */
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

afterAll(() => removeProjects("global-type-names"));

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (schema: object) => ({
  "200": { description: "ok", content: { "application/json": { schema } } },
});
const binary = { type: "string", format: "binary" };

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Files", version: "1" },
    paths: {
      "/blobs": {
        get: { operationId: "getBlob", tags: ["files"], responses: ok(ref("Blob")) },
        post: {
          operationId: "upload",
          tags: ["files"],
          requestBody: {
            required: true,
            content: { "application/octet-stream": { schema: binary } },
          },
          responses: ok(ref("Record")),
        },
      },
      "/forms/{folder}": {
        post: {
          operationId: "send",
          tags: ["files"],
          parameters: [{ name: "folder", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: { type: "object", properties: { file: binary } },
              },
            },
          },
          responses: ok(ref("FormData")),
        },
      },
      "/download": {
        get: {
          operationId: "download",
          tags: ["files"],
          responses: {
            "200": { description: "ok", content: { "application/pdf": { schema: binary } } },
          },
        },
      },
    },
    components: {
      schemas: {
        Blob: { type: "object", properties: { sha: { type: "string" } } },
        Record: { type: "object", properties: { meta: { type: "object" } } },
        FormData: {
          type: "object",
          properties: { extra: { type: "object", additionalProperties: true } },
        },
      },
    },
  }),
);

describe("an import whose schemas are named like the platform's types", () => {
  it.each(["zod", "valibot", "arktype", "none"] as const)("compiles (%s)", (validation) => {
    const files = generateCode(SPEC, { type: "openapi", outputDir: "src", validation }, "files");
    const dir = writeProject(`global-type-names/${validation}`, files);

    expect(
      compileProject(
        dir,
        files.map((file) => file.path),
        { ...STRICT },
      ),
    ).toEqual([]);
  });
});
