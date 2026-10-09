/**
 * The options of `courier-studio import` as Import API's options: its
 * defaults for each one left out, the values each option takes, and the
 * endpoints `--include` and `--exclude` name by tag, path or operationId.
 */
import { describe, expect, it } from "vitest";

import { importOptions, selectorOf } from "../../../src/commands/import/import-options";

describe("the import's options", () => {
  it("take Import API's defaults for every option left out", () => {
    expect(importOptions({}, "pets", "openapi")).toEqual({
      type: "openapi",
      sourceName: "pets",
      outputDir: "src/api",
      validation: "zod",
      groupBy: "tag",
      generateClient: "direct",
      generateTypes: true,
      generateSchemas: true,
      includeComments: true,
      addAuthMiddleware: false,
      selectedEndpoints: null,
    });
  });

  it("take what the command line names, and the selectors it gives", () => {
    const options = importOptions(
      {
        out: "lib/apis",
        validation: "valibot",
        "group-by": "path",
        client: "both",
        types: false,
        include: "tag:pets",
      },
      "pets",
      "swagger",
    );

    expect(options).toMatchObject({
      type: "swagger",
      outputDir: "lib/apis",
      validation: "valibot",
      groupBy: "path",
      generateClient: "both",
      generateTypes: false,
      include: { tags: ["pets"] },
    });
    expect(options).not.toHaveProperty("exclude");
  });

  it("refuse a value an option does not take, naming the ones it does", () => {
    expect(() => importOptions({ validation: "yup" }, "pets", "openapi")).toThrow(
      '--validation takes zod, valibot, arktype, none, not "yup"',
    );
    expect(() => importOptions({ "group-by": "folder" }, "pets", "openapi")).toThrow("--group-by");
    expect(() => importOptions({ client: "browser" }, "pets", "openapi")).toThrow("--client");
  });
});

describe("a selector on the command line", () => {
  it("names endpoints by tag, path and operationId, separated by commas", () => {
    expect(
      selectorOf("include", "tag:pets, path:/users/{id}:activate,op:getUser,tag:store"),
    ).toEqual({
      tags: ["pets", "store"],
      paths: ["/users/{id}:activate"],
      operationIds: ["getUser"],
    });
    expect(selectorOf("include", undefined)).toBeUndefined();
    expect(selectorOf("include", " ")).toBeUndefined();
  });

  it("refuses a part that names none of them", () => {
    expect(() => selectorOf("exclude", "pets")).toThrow(
      '--exclude takes tag:<name>, path:<path> and op:<operationId>, not "pets"',
    );
    expect(() => selectorOf("exclude", "kind:x")).toThrow('not "kind:x"');
    expect(() => selectorOf("exclude", "tag:")).toThrow('not "tag:"');
  });
});
