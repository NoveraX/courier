/**
 * Whether a file is merged or written whole turns on whether it declares
 * endpoints. A file that parses is told by its syntax, so a schemas module
 * whose doc comments hold the lines a group file is made of is written as
 * generated; a file saved mid-edit is told by how it reads.
 */
import { describe, expect, it } from "vitest";

import { declaresEndpoints } from "../../../src/apis/merge/declares-endpoints";

describe("declaresEndpoints", () => {
  it("finds a group that declares endpoints", () => {
    const group =
      'export const pets = defineGroup({\n  prefix: "/pets",\n  endpoints: {\n    list: endpoint.get(""),\n  },\n});\n';

    expect(declaresEndpoints(group)).toBe(true);
  });

  it("finds none in a module whose doc comment reads like a group", () => {
    const schemas = [
      "/**",
      "export const Pets = defineGroup({",
      "  endpoints: {",
      " */",
      "export type Pet = { id: string };",
      "",
    ].join("\n");

    expect(declaresEndpoints(schemas)).toBe(false);
  });

  it("finds a group in a file saved mid-edit by how its lines read", () => {
    const broken =
      'export const pets = defineGroup({\n  endpoints: {\n    list: endpoint.get("x".response(),\n';

    expect(declaresEndpoints(broken)).toBe(true);
  });
});
