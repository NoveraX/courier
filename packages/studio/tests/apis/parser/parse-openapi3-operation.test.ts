/**
 * What an OpenAPI operation turns into, checked by calling the generated
 * client against a real server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { generatedCall, generatedProject, loadGenerated } from "../../helpers/generated-project";
import { type RecordingServer, startRecordingServer } from "../../helpers/recording-server";

const VALIDATORS = ["zod", "valibot", "arktype", "none"] as const;

const project = generatedProject("courier-openapi-operations");

let server: RecordingServer;

beforeAll(async () => {
  server = await startRecordingServer((request) => {
    if (request.method === "DELETE") return { status: 204 };
    return { contentType: "application/json", body: JSON.stringify({ id: "f1" }) };
  });
});

afterAll(async () => {
  await server.close();
  project.remove();
});

function specWith(paths: Record<string, unknown>): string {
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Files", version: "1" },
    servers: [{ url: `${server.url}/v1` }],
    paths,
    components: {
      schemas: {
        ClientError: {
          type: "object",
          required: ["type", "status"],
          properties: { type: { type: "string" }, status: { type: "integer" } },
        },
        File: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      },
    },
  });
}

function generate(spec: string, validation: (typeof VALIDATORS)[number]) {
  return generateCode(parseSpec(spec), { type: "openapi", outputDir: "src", validation }, "box");
}

function callFor(spec: string, validation: (typeof VALIDATORS)[number], name: string) {
  return generatedCall(loadGenerated(generate(spec, validation), "src/box/index.ts"), [
    "boxApi",
    "files",
    name,
  ]);
}

const ERROR_ANSWER = {
  description: "An unexpected client error.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ClientError" } } },
};

describe.each(VALIDATORS)(
  "an operation answering 204 beside a default error (%s)",
  (validation) => {
    const deleteFile = {
      tags: ["files"],
      operationId: "deleteFile",
      parameters: [{ name: "file_id", in: "path", required: true, schema: { type: "string" } }],
      responses: { "204": { description: "Deleted." }, default: ERROR_ANSWER },
    };

    it("resolves when the server answers 204", async () => {
      const call = callFor(
        specWith({ "/files/{file_id}": { delete: deleteFile } }),
        validation,
        "deleteFile",
      );

      await expect(call({ file_id: "f1" })).resolves.toBeNull();
      expect(server.requests.at(-1)).toMatchObject({ method: "DELETE", path: "/v1/files/f1" });
    });

    it("still takes a declared 200 over the default", async () => {
      const getFile = {
        ...deleteFile,
        operationId: "getFile",
        responses: {
          default: ERROR_ANSWER,
          "200": {
            description: "ok",
            content: { "application/json": { schema: { $ref: "#/components/schemas/File" } } },
          },
        },
      };
      const call = callFor(
        specWith({ "/files/{file_id}": { get: getFile } }),
        validation,
        "getFile",
      );

      await expect(call({ file_id: "f1" })).resolves.toEqual({ id: "f1" });
    });
  },
);

describe.each(VALIDATORS)("a HEAD operation that declares a response body (%s)", (validation) => {
  it("resolves, since a HEAD answer never carries the body", async () => {
    const headFile = {
      tags: ["files"],
      operationId: "fileExists",
      parameters: [{ name: "file_id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": {
          description: "ok",
          content: { "application/json": { schema: { $ref: "#/components/schemas/File" } } },
        },
      },
    };
    const call = callFor(
      specWith({ "/files/{file_id}": { head: headFile } }),
      validation,
      "fileExists",
    );

    await expect(call({ file_id: "f1" })).resolves.toBeNull();
    expect(server.requests.at(-1)).toMatchObject({ method: "HEAD", path: "/v1/files/f1" });
  });
});

describe.each(VALIDATORS)("a query parameter named with a hyphen (%s)", (validation) => {
  const getFile = {
    tags: ["files"],
    operationId: "getFile",
    parameters: [
      { name: "file-id", in: "path", required: true, schema: { type: "string" } },
      { name: "page-size", in: "query", schema: { type: "integer" } },
    ],
    responses: {
      "200": {
        description: "ok",
        content: { "application/json": { schema: { $ref: "#/components/schemas/File" } } },
      },
    },
  };
  const spec = () => specWith({ "/files/{file-id}": { get: getFile } });

  it("is sent under the name the specification gives it", async () => {
    await callFor(spec(), validation, "getFile")({ file_id: "f1", "page-size": 10 });

    expect(server.requests.at(-1)).toMatchObject({
      path: "/v1/files/f1",
      query: [["page-size", "10"]],
    });
  });

  it("is typed under that name", () => {
    const check = [
      'import { boxApi } from "./src/box/index";',
      'export const read = () => boxApi.files.getFile({ file_id: "f1", "page-size": 10 });',
    ].join("\n");

    expect(
      project.diagnostics(`hyphen-${validation}`, generate(spec(), validation), check),
    ).toEqual([]);
  });
});
