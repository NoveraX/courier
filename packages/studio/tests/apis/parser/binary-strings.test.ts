/**
 * A string that holds a file's bytes is marked `binary`, on a property, on a
 * list's item and on a schema of its own, so a multipart form's file can be
 * told from its text: OpenAPI 3.0 writes `format: binary`, OpenAPI 3.1 a
 * `contentMediaType` without a `contentEncoding`, its type left out or not,
 * and Swagger 2.0 a parameter of type `file`. A string encoded as text —
 * `base64`, or 3.0's `format: byte` — holds no bytes of its own.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import type { ParsedSpec } from "../../../src/apis/parser/types";

/** A spec of one multipart upload whose fields are `properties`. */
function upload(
  openapi: string,
  properties: Record<string, unknown>,
  schemas: Record<string, unknown> = {},
): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi,
      info: { title: "Files", version: "1" },
      paths: {
        "/files": {
          post: {
            tags: ["files"],
            operationId: "uploadFile",
            requestBody: {
              content: { "multipart/form-data": { schema: { type: "object", properties } } },
            },
            responses: { "200": { description: "ok" } },
          },
        },
      },
      components: { schemas },
    }),
  );
}

/** Which of the upload's fields, and which of their items, hold bytes. */
function binaryFields(spec: ParsedSpec): Record<string, [field: boolean, item: boolean]> {
  const body = spec.groups.flatMap((group) => group.endpoints)[0]?.requestBody;
  return Object.fromEntries(
    Object.entries(body?.properties ?? {}).map(([name, prop]) => [
      name,
      [prop.binary === true, prop.items?.binary === true],
    ]),
  );
}

describe("a string that holds a file's bytes", () => {
  it("is marked under OpenAPI 3.0, by format: binary", () => {
    const spec = upload(
      "3.0.3",
      {
        cover: { type: "string", format: "binary" },
        scans: { type: "array", items: { type: "string", format: "binary" } },
        checksum: { type: "string", format: "byte" },
        title: { type: "string" },
        back: { $ref: "#/components/schemas/File" },
      },
      { File: { type: "string", format: "binary" } },
    );

    expect(binaryFields(spec)).toEqual({
      cover: [true, false],
      scans: [false, true],
      checksum: [false, false],
      title: [false, false],
      back: [false, false],
    });
    expect(spec.schemas.File?.binary).toBe(true);
  });

  it("is marked under OpenAPI 3.1, by a contentMediaType with no contentEncoding", () => {
    const spec = upload("3.1.0", {
      cover: { type: "string", contentMediaType: "image/png" },
      untyped: { contentMediaType: "application/octet-stream" },
      scans: { type: "array", items: { contentMediaType: "image/png" } },
      encoded: { type: "string", contentMediaType: "image/png", contentEncoding: "base64" },
      count: { type: "integer", contentMediaType: "text/plain" },
      nullable: { type: ["string", "null"], contentMediaType: "image/png" },
    });

    expect(binaryFields(spec)).toEqual({
      cover: [true, false],
      untyped: [true, false],
      scans: [false, true],
      encoded: [false, false],
      count: [false, false],
      nullable: [true, false],
    });
  });

  it("is marked for a Swagger 2.0 form's file parameter", () => {
    const spec = parseSpec(
      JSON.stringify({
        swagger: "2.0",
        info: { title: "Files", version: "1" },
        consumes: ["multipart/form-data"],
        paths: {
          "/files": {
            post: {
              tags: ["files"],
              operationId: "uploadFile",
              parameters: [
                { name: "file", in: "formData", type: "file", required: true },
                { name: "note", in: "formData", type: "string" },
              ],
              responses: { "200": { description: "ok" } },
            },
          },
        },
      }),
    );

    expect(binaryFields(spec)).toEqual({ file: [true, false], note: [false, false] });
  });
});
