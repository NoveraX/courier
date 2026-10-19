/**
 * Whether a specification's path names a parameter — OpenAPI's braces or a
 * segment Postman starts with a colon, never a colon inside a segment — and
 * the names operations without an id are given by it, which such a colon
 * does not make reads of one record.
 */
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import { namesPathParam } from "../../../src/apis/parser/names-path-param";
import { generateEndpointName } from "../../../src/apis/parser/naming-utils";

describe("namesPathParam", () => {
  it("reads OpenAPI's braces and Postman's leading colon, and no colon inside a segment", () => {
    expect(namesPathParam("/files/{id}")).toBe(true);
    expect(namesPathParam("/users/:id")).toBe(true);
    expect(namesPathParam("/v1/projects:search")).toBe(false);
  });
});

describe("an operation without an id at a path with a colon inside a segment", () => {
  it("is named as a list rather than a read of one record", () => {
    expect(generateEndpointName("get", "/v1/projects:search")).toBe("getAllProjectsSearch");
    expect(generateEndpointName("get", "/v1/projects/{id}")).toBe("getById");
  });

  it("is told apart from another by its path, without the suffix of a read by id", () => {
    const parsed = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Files", version: "1" },
        paths: {
          "/files": { post: { tags: ["files"], responses: { "200": { description: "ok" } } } },
          "/files:import": {
            post: { tags: ["files"], responses: { "200": { description: "ok" } } },
          },
        },
      }),
    );
    const named = parsed.groups.flatMap((group) => group.endpoints);

    expect(named.map((endpoint) => [endpoint.name, endpoint.path])).toEqual([
      ["postFiles", "files"],
      ["postFilesImport", "files::import"],
    ]);
  });
});
