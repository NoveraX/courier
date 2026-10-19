/**
 * A path parameter whose name a `:name` placeholder cannot read whole — a
 * dot, a leading digit, a hyphen — is generated under a name it
 * can, the same in the path and in the variables, so the client compiles and
 * fills the path; an operation whose parameter is followed at once by a
 * letter or a digit is left out, and the parse says why.
 */
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

const ok = { 200: { description: "ok" } };

function operation(operationId: string, ...names: string[]) {
  const parameters = names.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  return { get: { operationId, tags: ["files"], parameters, responses: ok } };
}

const SPEC = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Files", version: "1" },
  servers: [{ url: "https://files.test" }],
  paths: {
    "/files/{1st}/{id.v}": operation("getFile", "1st", "id.v"),
    "/folders/{folder-id}": operation("getFolder", "folder-id"),
    "/items/{id}5": operation("getItem", "id"),
  },
});

afterAll(() => removeProjects("path-parameter-names"));

describe("path parameters a placeholder cannot read whole", () => {
  it("are named alike in the path and the variables", () => {
    const [getFile, getFolder] = parseSpec(SPEC).groups[0]?.endpoints ?? [];

    expect(getFile).toMatchObject({ path: "files/:_1st/:id_v" });
    expect(getFile?.parameters.map((parameter) => parameter.name)).toEqual(["_1st", "id_v"]);
    expect(getFolder).toMatchObject({ path: "folders/:folder_id" });
  });

  it("leave out an operation whose parameter a letter or a digit follows, and say why", () => {
    const spec = parseSpec(SPEC);

    expect(spec.groups[0]?.endpoints.map((endpoint) => endpoint.name)).toEqual([
      "getFile",
      "getFolder",
    ]);
    expect(spec.skipped).toEqual([
      {
        method: "ALL",
        path: "/items/{id}5",
        reason:
          "its parameter {id} is followed by 5, which a path parameter's name would take in, so its operations are left out",
      },
    ]);
  });

  it("generate a client that compiles", () => {
    const files = generateCode(parseSpec(SPEC), { type: "openapi", outputDir: "src/api" }, "files");
    const dir = writeProject("path-parameter-names/zod", files);

    expect(compileProject(dir, ["src/api/files/index.ts"], STRICT)).toEqual([]);
  });
});
