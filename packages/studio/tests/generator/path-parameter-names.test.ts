/**
 * A path parameter whose name a `:name` placeholder cannot read whole — a
 * dot, a leading digit, a hyphen — is generated under a name it
 * can, the same in the path and in the variables, so the client compiles and
 * fills the path; a parameter followed at once by a letter or a digit is
 * written in braces, which end its name, and Google's `{+name}` stays a
 * parameter whose value keeps its slashes.
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
    "/v1/{+name}:cancel": operation("cancelOperation", "name"),
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

  it("write a parameter a letter or a digit follows in braces, and Google's {+name} as it is", () => {
    const spec = parseSpec(SPEC);
    const [, , getItem, cancelOperation] = spec.groups[0]?.endpoints ?? [];

    expect(spec.skipped).toEqual([]);
    expect(getItem).toMatchObject({ path: "items/{id}5" });
    expect(getItem?.parameters.map((parameter) => parameter.name)).toEqual(["id"]);
    expect(cancelOperation).toMatchObject({ path: "v1/{+name}::cancel" });
    expect(cancelOperation?.parameters.map((parameter) => parameter.name)).toEqual(["name"]);
  });

  it("generate a client that compiles", () => {
    const files = generateCode(parseSpec(SPEC), { type: "openapi", outputDir: "src/api" }, "files");
    const dir = writeProject("path-parameter-names/zod", files);

    expect(compileProject(dir, ["src/api/files/index.ts"], STRICT)).toEqual([]);
  });
});
