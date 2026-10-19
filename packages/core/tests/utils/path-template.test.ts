/**
 * A path is read as its request is addressed: `:name` is a parameter, `::`
 * one colon the path sends as written — as a Google method's
 * `index:inspect` needs — and an absolute URL's scheme and host are never
 * read, so a port or an IPv6 address holds no parameter.
 */
import { describe, expect, it } from "vitest";

import {
  escapePathText,
  fillPathParams,
  pathParamNames,
  pathPieces,
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
      { kind: "param", name: "name" },
      { kind: "text", text: ":cancel" },
    ]);
  });

  it("joins text next to text into one piece, the host of an absolute URL with it", () => {
    expect(pathPieces("https://[::1]/index::inspect")).toEqual([
      { kind: "text", text: "https://[::1]/index:inspect" },
    ]);
    expect(pathPieces(":a:b")).toEqual([
      { kind: "param", name: "a" },
      { kind: "param", name: "b" },
    ]);
    expect(pathPieces("")).toEqual([]);
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
