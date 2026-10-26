/**
 * A new endpoint as the generator types it in: a name the client's calls
 * can use and the group has none by; its variables — a field for each
 * variable its path names, or one to name for a write — and its response
 * as placeholders; placed after the group's last endpoint, past its comma
 * or with one, or between the braces of an empty group.
 */
import { describe, expect, it } from "vitest";

import { endpointSnippet, insertion, nameProblem } from "../src/generate/endpoint-snippet";

describe("a new endpoint's name", () => {
  it("is one the client's calls can use, and the group has none by", () => {
    expect(nameProblem("cancel", ["list", "place"])).toBeUndefined();
    expect(nameProblem("place", ["list", "place"])).toContain(
      "already has an endpoint named place",
    );
    expect(nameProblem("2fa", [])).toBeDefined();
    expect(nameProblem("cancel-order", [])).toBeDefined();
  });
});

describe("a new endpoint as typed in", () => {
  it("names a field for each variable its path names, the response a placeholder", () => {
    expect(endpointSnippet("endpoint", { name: "get", method: "get", path: ":id" })).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a snippet's placeholders, not a template's
      'get: endpoint.get(":id").variables<${1:{ id: string \\}}>().response<${2:unknown}>(),$0',
    );
  });

  it("asks a write for a field to name, and a read with no variables for none", () => {
    expect(endpointSnippet("e", { name: "create", method: "post", path: "" })).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a snippet's placeholders, not a template's
      'create: e.post("").variables<${1:{ name: string \\}}>().response<${2:unknown}>(),$0',
    );
    expect(endpointSnippet("endpoint", { name: "list", method: "get", path: "" })).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a snippet's placeholders, not a template's
      'list: endpoint.get("").response<${1:unknown}>(),$0',
    );
  });

  it("names the parameters as Courier reads the path: in braces, once each, and no colon of text", () => {
    const fields = (path: string) =>
      /\.variables<\$\{1:\{ (.*) \\\}\}>/.exec(
        endpointSnippet("endpoint", { name: "x", method: "get", path }),
      )?.[1];

    expect(fields("v1/{+name}::cancel")).toBe("name: string");
    expect(fields("files/{id}abc")).toBe("id: string");
    expect(fields(":id/copies/:id")).toBe("id: string");
    expect(fields("index::inspect")).toBeUndefined();
    expect(fields("items/:id?expand=:what")).toBe("id: string");
    expect(fields("https://reader:x@api.example.com/items/:id")).toBe("id: string");
  });

  it("writes a path's braces as text, not as the snippet's own", () => {
    expect(
      endpointSnippet("endpoint", { name: "op", method: "get", path: "v1/{+name}" }),
    ).toContain('endpoint.get("v1/{+name\\}")');
  });

  it("writes a path's dollar and quote as text, not as the snippet's own", () => {
    expect(endpointSnippet("endpoint", { name: "odd", method: "get", path: 'a$"b' })).toContain(
      'endpoint.get("a\\$\\"b")',
    );
  });
});

describe("where a new endpoint goes", () => {
  const text = [
    "export const orders = defineGroup({",
    "  endpoints: {",
    '    list: endpoint.get(""),',
    "  },",
    "});",
  ].join("\n");
  const lines = text.split("\n");
  const offsetAt = (line: number, column: number) =>
    lines.slice(0, line - 1).reduce((sum, each) => sum + each.length + 1, 0) + column - 1;

  it("goes past the last endpoint's comma, on a line of its own at the endpoints' indent", () => {
    const at = insertion(
      text,
      offsetAt,
      { open: { line: 2, column: 14 }, last: { line: 3, column: 27, comma: true } },
      "  ",
    );

    expect(text.slice(0, at.offset).endsWith('endpoint.get(""),')).toBe(true);
    expect(at).toMatchObject({ before: "\n    ", after: "" });
  });

  it("gives the last endpoint a comma when it has none, and fills an empty group between its braces", () => {
    const bare = insertion(
      text,
      offsetAt,
      { open: { line: 2, column: 14 }, last: { line: 3, column: 27, comma: false } },
      "  ",
    );
    const empty = insertion(
      "  endpoints: {}",
      (_line, column) => column - 1,
      { open: { line: 1, column: 14 } },
      "  ",
    );

    expect(bare.before).toBe(",\n    ");
    expect(empty).toEqual({ offset: 14, before: "\n    ", after: "\n  " });
  });
});
