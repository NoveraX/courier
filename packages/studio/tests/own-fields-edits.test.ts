/**
 * The helper a module of schemas or endpoints declares for an object whose
 * fields include a name every object inherits, `_ownFields`, follows what
 * calls it through every edit Studio makes to a file it wrote. An update
 * brings it into a file written before such a field was in the
 * specification, and takes it out with the last endpoint that called it;
 * Manage writes it after the declaration with the first endpoint that calls
 * it, beside the imports the helper needs, and takes it and those imports
 * out with the last; schemas added and removed carry it the same way. Each
 * file is compiled as a project with every check on, so a helper missing,
 * one left that nothing calls, or overloads pulled apart all fail.
 */
import { afterAll, describe, expect, it } from "vitest";
import type { GeneratedFile } from "../src/apis/generator";
import { type GenerateOptions, generateCode } from "../src/apis/generator";
import { appendEndpointsToGroup } from "../src/apis/manage/append-to-group";
import { mergeSchemaFiles } from "../src/apis/manage/merge-schemas";
import { removeEndpointsFromFile } from "../src/apis/manage/remove-endpoints-from-file";
import { removeOrphanSchemas } from "../src/apis/manage/remove-schemas";
import { mergeGroupFile } from "../src/apis/merge/merge-group";
import type { FingerprintResult } from "../src/apis/merge/types";
import { parseSpec } from "../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "./helpers/generated-project";

const GROUP = "src/api/shop/things/index.ts";
const SCHEMAS = "src/api/shop/things/schemas.ts";

const json = (schema: object) => ({ "application/json": { schema } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/* The shop's specification; with `inherited`, a thing has a field `constructor`, and it is added
   with a parameter beside it, which the variables check through `_ownFields`, and a toy is new. */
function spec(inherited: boolean) {
  const thing = {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string" },
      ...(inherited && { constructor: { type: "string" } }),
    },
  };
  const toy = { type: "object", properties: { constructor: { type: "string" } } };
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Shop", version: "1" },
      servers: [{ url: "https://shop.test" }],
      components: { schemas: { Thing: thing, ...(inherited && { Toy: toy }) } },
      paths: {
        "/things": {
          get: {
            operationId: "listThings",
            tags: ["things"],
            responses: { "200": { description: "ok", content: json(ref("Thing")) } },
          },
          ...(inherited && {
            post: {
              operationId: "addThing",
              tags: ["things"],
              parameters: [{ name: "dryRun", in: "query", schema: { type: "boolean" } }],
              requestBody: { required: true, content: json(ref("Thing")) },
              responses: { "200": { description: "ok", content: json(ref("Thing")) } },
            },
          }),
        },
        ...(inherited && {
          "/toys": {
            get: {
              operationId: "listToys",
              tags: ["things"],
              responses: { "200": { description: "ok", content: json(ref("Toy")) } },
            },
          },
        }),
      },
    }),
  );
}

function generated(validation: GenerateOptions["validation"], inherited: boolean) {
  return generateCode(
    spec(inherited),
    { type: "openapi", outputDir: "src/api", validation, generateTypes: true },
    "shop",
  );
}

function contentAt(files: readonly GeneratedFile[], path: string): string {
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`nothing was generated at ${path}`);
  return file.content;
}

/* The project the files make, one of them as an edit left it, compiled with every check on. */
function compiled(label: string, files: readonly GeneratedFile[], path: string, content: string) {
  const edited = files.map((file) => (file.path === path ? { path, content } : file));
  const dir = writeProject(`own-fields-edits/${label}`, edited);
  return compileProject(dir, ["src/api/shop/index.ts"], {
    ...STRICT,
    exactOptionalPropertyTypes: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
  });
}

const classified = (endpoints: FingerprintResult["endpoints"]): FingerprintResult => ({
  endpoints,
  existingCode: {},
});

afterAll(() => removeProjects("own-fields-edits"));

describe.each([["zod"], ["valibot"], ["arktype"]] as const)("_ownFields with %s", (validation) => {
  const before = generated(validation, false);
  const after = generated(validation, true);

  it("is brought by an update into a file written before such a field was in the specification", () => {
    const merged = mergeGroupFile(
      contentAt(before, GROUP),
      contentAt(after, GROUP),
      classified({ listThings: "safe", addThing: "new", listToys: "new" }),
    );

    expect(merged.status).not.toBe("conflict");
    expect(merged.content).toContain("function _ownFields");
    expect(compiled(`${validation}/update-in`, after, GROUP, merged.content)).toEqual([]);
  }, 60_000);

  it("goes with an update that leaves no endpoint calling it, and the imports only it used", () => {
    const merged = mergeGroupFile(
      contentAt(after, GROUP),
      contentAt(before, GROUP),
      classified({ listThings: "safe", addThing: "removed", listToys: "removed" }),
    );

    expect(merged.content).not.toContain("ownFields");
    expect(merged.changes).toContainEqual({
      type: "removed",
      target: "helper:_ownFields",
      detail: "no endpoint calls it",
    });
    expect(compiled(`${validation}/update-out`, before, GROUP, merged.content)).toEqual([]);
  }, 60_000);

  it("is written by Manage after the declaration with the first endpoint that calls it", () => {
    const appended = appendEndpointsToGroup(
      GROUP,
      contentAt(before, GROUP),
      contentAt(after, GROUP),
      ["addThing"],
    );

    expect(appended).toContain("addThing:");
    expect(appended.indexOf("function _ownFields")).toBeGreaterThan(
      appended.indexOf("defineGroup({"),
    );
    expect(compiled(`${validation}/manage-in`, after, GROUP, appended)).toEqual([]);
  }, 60_000);

  it("goes, with the imports only it used, when Manage removes the last endpoint calling it", () => {
    const removal = removeEndpointsFromFile(GROUP, contentAt(after, GROUP), ["addThing"]);
    const content = removal.content ?? "";

    expect(content).toContain("listThings");
    expect(content).not.toContain("ownFields");
    expect(content).not.toContain("import type * as ark");
    expect(compiled(`${validation}/manage-out`, after, GROUP, content)).toEqual([]);
  }, 60_000);

  it("comes with a schema Manage adds, its overloads together, and goes with the last one", () => {
    const names = ["Toy", "ToySchema"];
    const added = mergeSchemaFiles(
      SCHEMAS,
      contentAt(before, SCHEMAS),
      contentAt(after, SCHEMAS),
      names,
    );
    const removed = removeOrphanSchemas(added, names) ?? "";

    expect(added).toContain("export const ToySchema");
    expect(added.match(/function _ownFields/g)?.length).toBe(
      contentAt(after, SCHEMAS).match(/function _ownFields/g)?.length,
    );
    expect(compiled(`${validation}/schemas-in`, before, SCHEMAS, added)).toEqual([]);
    expect(removed).not.toMatch(/ToySchema|ownFields/);
    expect(compiled(`${validation}/schemas-out`, before, SCHEMAS, removed)).toEqual([]);
  }, 60_000);
});
