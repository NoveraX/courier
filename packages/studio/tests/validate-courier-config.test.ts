import { describe, expect, it } from "vitest";
import type { ProjectInputs } from "../src/server/read-project-inputs";
import { validateCourierConfig } from "../src/server/validate-courier-config";

const CONFIG_FILE = "/project/courier.config.ts";
const DEP_HASHES: ProjectInputs = new Map([[CONFIG_FILE, "a".repeat(64)]]);
const API = { options: { baseURL: "https://api.example" } };

class SourceBag {
  readonly api = API;
}

function rejectionOf(config: unknown): unknown {
  try {
    validateCourierConfig(config, CONFIG_FILE, DEP_HASHES);
  } catch (err) {
    return err;
  }
  return null;
}

describe("validateCourierConfig", () => {
  it("accepts sources given as an object literal, an empty one included", () => {
    expect(rejectionOf({ sources: { api: API } })).toBeNull();
    expect(rejectionOf({ sources: {} })).toBeNull();
  });

  it("accepts sources with a null prototype, as a native module namespace has", () => {
    const namespace: Record<string, unknown> = Object.create(null);
    namespace.api = API;
    Object.defineProperty(namespace, Symbol.toStringTag, { value: "Module" });

    expect(rejectionOf({ sources: namespace })).toBeNull();
    expect(rejectionOf({ sources: Object.create(null) })).toBeNull();
  });

  it.each([
    ["a Map", new Map([["api", API]])],
    ["a Set", new Set([API])],
    ["a Promise", Promise.resolve({ api: API })],
    ["a Date", new Date(0)],
    ["an Error", new Error("sources")],
    ["an instance of SourceBag", new SourceBag()],
    ["an object with a prototype of its own", Object.create({ api: API })],
    ["an array", [API]],
    ["a function", () => ({ api: API })],
    ["a string", "api"],
  ])("rejects sources that are %s, naming what they are", (found, sources) => {
    expect(rejectionOf({ sources })).toMatchObject({
      code: "CONFIG_INVALID",
      message: `courier.config.sources is ${found}, not an object of named sources`,
      context: { configFile: CONFIG_FILE },
      depHashes: DEP_HASHES,
    });
  });

  it("rejects a config without sources, and one that is not an object", () => {
    expect(rejectionOf({})).toMatchObject({
      code: "CONFIG_INVALID",
      message: "courier.config.sources is required; declare `sources: {}` while there are none",
    });
    expect(rejectionOf({ sources: null })).toMatchObject({ code: "CONFIG_INVALID" });
    expect(rejectionOf("config")).toMatchObject({
      code: "CONFIG_INVALID",
      message: "courier.config must export an object",
    });
  });

  it("rejects an entry that is not a source, naming its key", () => {
    expect(rejectionOf({ sources: { api: API, billing: undefined } })).toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining("courier.config.sources.billing is undefined, not a source"),
    });
  });
});

describe("validateCourierConfig on imports", () => {
  const URL_IMPORT = {
    importType: "url",
    type: "openapi",
    from: "https://specs.example/pets.json",
    outputDir: "src/api",
  };
  const withImport = (entry: unknown) => ({ sources: { api: API }, imports: { x: entry } });

  it("accepts every field an import declares, and none of the optional ones", () => {
    expect(rejectionOf({ sources: { api: API } })).toBeNull();
    expect(
      rejectionOf(withImport({ importType: "file", type: "swagger", outputDir: "src/api" })),
    ).toBeNull();
    expect(
      rejectionOf(
        withImport({
          ...URL_IMPORT,
          sourceName: "pets",
          validation: "valibot",
          groupBy: "path",
          generateTypes: false,
          generateSchemas: true,
          generateClient: "both",
          addAuthMiddleware: false,
          includeComments: true,
          include: { tags: ["pets"], operationIds: ["getPet"] },
          exclude: { paths: ["/pets/{id}"] },
          transform: (spec: unknown) => spec,
          auth: { type: "header", headers: { "x-api-key": "k" } },
          pinHash: "0123",
        }),
      ),
    ).toBeNull();
  });

  it.each([
    [
      "an entry that is not an object",
      "pets",
      "courier.config.imports.x is a string, not an import",
    ],
    [
      "a URL given as a number",
      { ...URL_IMPORT, from: 5 },
      "courier.config.imports.x.from is a number, not an http or https URL",
    ],
    [
      "a URL that is not a web address",
      { ...URL_IMPORT, from: "file:///etc/passwd" },
      "courier.config.imports.x.from is a string, not an http or https URL",
    ],
    [
      "an unknown import type",
      { ...URL_IMPORT, importType: "git" },
      "courier.config.imports.x.importType is not url, file or raw",
    ],
    [
      "an unknown spec type",
      { ...URL_IMPORT, type: "wsdl" },
      "courier.config.imports.x.type is not openapi, swagger, graphql, asyncapi or postman",
    ],
    [
      "an output directory that is not a string",
      { ...URL_IMPORT, outputDir: ["src"] },
      "courier.config.imports.x.outputDir is a list, not a folder",
    ],
    [
      "an unknown validation library",
      { ...URL_IMPORT, validation: "yup" },
      "courier.config.imports.x.validation is a string, not zod, valibot, arktype, none",
    ],
    [
      "a flag that is not a boolean",
      { ...URL_IMPORT, generateTypes: "yes" },
      "courier.config.imports.x.generateTypes is a string, not true or false",
    ],
    [
      "a selector list that is not strings",
      { ...URL_IMPORT, include: { tags: [1] } },
      "courier.config.imports.x.include.tags is not a list of strings",
    ],
    [
      "a transform that is not a function",
      { ...URL_IMPORT, transform: "upper" },
      "courier.config.imports.x.transform is a string, not a function",
    ],
    [
      "auth with no token",
      { ...URL_IMPORT, auth: { type: "bearer" } },
      "courier.config.imports.x.auth is an object, not a bearer, basic or header auth",
    ],
  ])("rejects %s, naming the field", (_label, entry, message) => {
    expect(rejectionOf(withImport(entry))).toMatchObject({ code: "CONFIG_INVALID", message });
  });

  it("rejects imports that are not an object of named imports", () => {
    expect(rejectionOf({ sources: { api: API }, imports: [URL_IMPORT] })).toMatchObject({
      code: "CONFIG_INVALID",
      message: "courier.config.imports is an array, not an object of named imports",
    });
  });
});
