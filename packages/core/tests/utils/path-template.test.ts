/**
 * A path is read as its request is addressed: `:name` is a parameter, and
 * so are `{name}`, whose end is written, and `{+name}`, whose value keeps
 * its slashes; `::` is one colon the path sends as written — as a Google method's
 * `index:inspect` needs — and an absolute URL's scheme and host are never
 * read, so a port or an IPv6 address holds no parameter.
 */
import { describe, expect, it } from "vitest";

import {
  encodePathValue,
  escapePathText,
  fillPathParams,
  type PathParam,
  pathParamNames,
  pathPieces,
  routeChangingPart,
} from "../../src/utils/path-template";

const marked = (name: string): string => `<${name}>`;

describe("pathParamNames", () => {
  it("names each parameter in the order the path holds it, inside a segment too", () => {
    expect(pathParamNames("orgs/:orgId/users/:id.json")).toEqual(["orgId", "id"]);
    expect(pathParamNames("flights/:from-:to")).toEqual(["from", "to"]);
    expect(pathParamNames("v1/:name:cancel")).toEqual(["name", "cancel"]);
    expect(pathParamNames(":id/copies/:id")).toEqual(["id", "id"]);
  });

  it("reads a doubled colon as one colon of text, not as the start of a parameter", () => {
    expect(pathParamNames("v1/urlInspection/index::inspect")).toEqual([]);
    expect(pathParamNames("v4/spreadsheets/:spreadsheetId::batchUpdate")).toEqual([
      "spreadsheetId",
    ]);
    expect(pathParamNames("rates/:::pair")).toEqual(["pair"]);
    expect(pathParamNames("a::::b")).toEqual([]);
  });

  it("names nothing after a colon no name follows", () => {
    expect(pathParamNames("a/:1/b")).toEqual([]);
    expect(pathParamNames("at/12:30")).toEqual([]);
    expect(pathParamNames("ranges/a:-b")).toEqual([]);
    expect(pathParamNames("tail:")).toEqual([]);
  });

  it("reads no parameter in an absolute URL's scheme and host", () => {
    expect(pathParamNames("https://[2001:db8::1]:8443/users/:id")).toEqual(["id"]);
    expect(pathParamNames("https://user:secret@api.test/v1/:version")).toEqual(["version"]);
    expect(pathParamNames("wss://host.test:9000")).toEqual([]);
    expect(pathParamNames(":proto://host/:id")).toEqual(["proto", "id"]);
  });
});

describe("fillPathParams", () => {
  it("sends a doubled colon as one", () => {
    expect(fillPathParams("v1/urlInspection/index::inspect", marked)).toBe(
      "v1/urlInspection/index:inspect",
    );
  });

  it("fills a parameter that a colon sent as written follows in its segment", () => {
    expect(fillPathParams("v1/:name::cancel", marked)).toBe("v1/<name>:cancel");
    expect(fillPathParams("rates/:::pair", marked)).toBe("rates/:<pair>");
    expect(fillPathParams("flights/:from-:to", marked)).toBe("flights/<from>-<to>");
  });

  it("leaves every other colon as the path writes it", () => {
    expect(fillPathParams("at/12:30/tail:", marked)).toBe("at/12:30/tail:");
  });

  it("keeps an absolute URL's host as written, an IPv6 address included", () => {
    expect(fillPathParams("http://[::1]:8080/a::b/:id", () => "7")).toBe("http://[::1]:8080/a:b/7");
  });

  it("asks for each parameter by its name", () => {
    const asked: string[] = [];
    fillPathParams("orgs/:orgId/users/:id", (name) => {
      asked.push(name);
      return "";
    });
    expect(asked).toEqual(["orgId", "id"]);
  });
});

describe("pathPieces", () => {
  it("splits a path into its text and its parameters, a doubled colon read as one", () => {
    expect(pathPieces("v1/:name::cancel")).toEqual([
      { kind: "text", text: "v1/" },
      { kind: "param", name: "name", keepsSlashes: false, written: ":name" },
      { kind: "text", text: ":cancel" },
    ]);
  });

  it("joins text next to text into one piece, the host of an absolute URL with it", () => {
    expect(pathPieces("https://[::1]/index::inspect")).toEqual([
      { kind: "text", text: "https://[::1]/index:inspect" },
    ]);
    expect(pathPieces(":a:b")).toEqual([
      { kind: "param", name: "a", keepsSlashes: false, written: ":a" },
      { kind: "param", name: "b", keepsSlashes: false, written: ":b" },
    ]);
    expect(pathPieces("")).toEqual([]);
  });
});

describe("a path's query and fragment", () => {
  it("hold no parameter, and are sent as written, a doubled colon too", () => {
    expect(pathParamNames("users/:id?expand=:what")).toEqual(["id"]);
    expect(pathParamNames("search?q=:term#:frag")).toEqual([]);
    expect(fillPathParams("users/:id?expand=:what&at=a::b", () => "7")).toBe(
      "users/7?expand=:what&at=a::b",
    );
    expect(fillPathParams("https://api.test?x=/:y", marked)).toBe("https://api.test?x=/:y");
  });

  it("are text in the pieces, after the last parameter", () => {
    expect(pathPieces("items/:id?sort=:field")).toEqual([
      { kind: "text", text: "items/" },
      { kind: "param", name: "id", keepsSlashes: false, written: ":id" },
      { kind: "text", text: "?sort=:field" },
    ]);
  });
});

describe("escapePathText", () => {
  it("writes text so that the path sends it as written", () => {
    const path = escapePathText("index:inspect");

    expect(path).toBe("index::inspect");
    expect(pathParamNames(path)).toEqual([]);
    expect(fillPathParams(escapePathText("a:b::c"), marked)).toBe("a:b::c");
  });
});

describe("a parameter written in braces", () => {
  it("is named where the brace ends its name, whatever text follows", () => {
    expect(pathParamNames("files/{id}abc")).toEqual(["id"]);
    expect(pathParamNames("files/{name}.{ext}")).toEqual(["name", "ext"]);
    expect(pathParamNames("v1/{+name}::cancel")).toEqual(["name"]);
    expect(pathParamNames("orgs/{org}/users/:id")).toEqual(["org", "id"]);
    expect(pathParamNames("a/:{id}")).toEqual(["id"]);
  });

  it("is text when the braces hold no name", () => {
    expect(pathParamNames("a/{1}/{a-b}/{}/{++x}/{ x }/{+}")).toEqual([]);
    expect(pathParamNames("a/{x/b}")).toEqual([]);
    expect(pathParamNames("a/{x")).toEqual([]);
    expect(pathParamNames("a/{{id}}")).toEqual(["id"]);
  });

  it("is not read in a query, a fragment, or an absolute URL's host", () => {
    expect(pathParamNames("items?filter={id}")).toEqual([]);
    expect(pathParamNames("items#{id}")).toEqual([]);
    expect(pathParamNames("https://{host}.test/{id}")).toEqual(["id"]);
  });

  it("is filled, saying whether its value keeps its slashes and how the path writes it", () => {
    const asked: PathParam[] = [];
    const filled = fillPathParams("v1/{+name}::cancel/{id}x/:n", (name, param) => {
      asked.push(param);
      return `<${name}>`;
    });

    expect(filled).toBe("v1/<name>:cancel/<id>x/<n>");
    expect(asked).toEqual([
      { kind: "param", name: "name", keepsSlashes: true, written: "{+name}" },
      { kind: "param", name: "id", keepsSlashes: false, written: "{id}" },
      { kind: "param", name: "n", keepsSlashes: false, written: ":n" },
    ]);
  });

  it("is a piece of its own, text on each side", () => {
    expect(pathPieces("files/{id}abc")).toEqual([
      { kind: "text", text: "files/" },
      { kind: "param", name: "id", keepsSlashes: false, written: "{id}" },
      { kind: "text", text: "abc" },
    ]);
  });
});

describe("text a path sends as written", () => {
  it("has its braces encoded, so that none starts a parameter", () => {
    const path = escapePathText("{draft}:v2");

    expect(path).toBe("%7Bdraft%7D::v2");
    expect(pathParamNames(path)).toEqual([]);
    expect(fillPathParams(path, marked)).toBe("%7Bdraft%7D:v2");
  });
});

describe("a parameter's value in the path", () => {
  it("is encoded whole, or part by part with its slashes kept for {+name}", () => {
    expect(encodePathValue("a/b c", false)).toBe("a%2Fb%20c");
    expect(encodePathValue("a/b c", true)).toBe("a/b%20c");
    expect(encodePathValue("projects/p/operations/o", true)).toBe("projects/p/operations/o");
    expect(encodePathValue("a?b#c:d", true)).toBe("a%3Fb%23c%3Ad");
  });

  it("names the part that would make the path another route", () => {
    expect(routeChangingPart("..", false)).toBe("..");
    expect(routeChangingPart("", false)).toBe("");
    expect(routeChangingPart("a/..", false)).toBeUndefined();
    expect(routeChangingPart("projects/../admin", true)).toBe("..");
    expect(routeChangingPart("a//b", true)).toBe("");
    expect(routeChangingPart("a/b/", true)).toBe("");
    expect(routeChangingPart("./a", true)).toBe(".");
    expect(routeChangingPart("a..b/c.d", true)).toBeUndefined();
  });
});
