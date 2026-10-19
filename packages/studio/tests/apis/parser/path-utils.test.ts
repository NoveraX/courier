/**
 * The prefix a group of paths takes, found as the reading it replaced found
 * it, and for any number of paths: that one spread every path's length into
 * one call, which a specification of some 125 000 paths overflowed. And a
 * path template as a Courier path: each parameter under a name a `:name`
 * placeholder reads whole, a colon written as text doubled so that the path
 * sends it, or the reason the path cannot be written.
 */
import { describe, expect, it } from "vitest";

import {
  convertPathParams,
  findCommonPrefix,
  pathParamName,
  unwritablePath,
} from "../../../src/apis/parser/path-utils";
import { seededRandom } from "../../helpers/seeded-random";

/* The reading this one replaced, as it stood. */
function spreadCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "/";
  if (paths.length === 1) {
    const first = paths[0] ?? "";
    const parts = first.split("/").filter(Boolean);
    if (parts.length <= 1) return "/";
    return `/${parts.slice(0, -1).join("/")}`;
  }

  const segments = paths.map((p) => p.split("/").filter(Boolean));
  const minLen = Math.min(...segments.map((s) => s.length));
  const common: string[] = [];
  const firstSegments = segments[0] ?? [];

  for (let i = 0; i < minLen; i++) {
    const segment = firstSegments[i];
    if (!segment || segment.startsWith("{") || segment.startsWith(":")) break;
    if (segments.every((s) => s[i] === segment)) {
      common.push(segment);
    } else break;
  }

  return common.length > 0 ? `/${common.join("/")}` : "/";
}

describe("findCommonPrefix", () => {
  it("finds what the reading it replaced found, on 5 000 random sets of paths", () => {
    const segments = ["a", "b", "{id}", ":id", "c"];
    for (let seed = 1; seed <= 5_000; seed += 1) {
      const next = seededRandom(seed);
      const paths = Array.from(
        { length: next(6) },
        () => `/${Array.from({ length: next(4) }, () => segments[next(5)]).join("/")}`,
      );

      expect(findCommonPrefix(paths)).toBe(spreadCommonPrefix(paths));
    }
  });

  it("finds the prefix of 300 000 paths", () => {
    const paths = Array.from({ length: 300_000 }, (_, at) => `/v1/items/${at}`);

    expect(findCommonPrefix(paths)).toBe("/v1/items");
  });
});

describe("pathParamName", () => {
  it("names a parameter as a placeholder reads it whole", () => {
    expect(pathParamName("id")).toBe("id");
    expect(pathParamName("file-id")).toBe("file_id");
    expect(pathParamName("id.v")).toBe("id_v");
    expect(pathParamName("1st")).toBe("_1st");
  });
});

describe("convertPathParams", () => {
  it("writes each placeholder as `:name`, a name of any characters but a brace or a slash", () => {
    expect(convertPathParams("/files/{name}.{ext}")).toBe("/files/:name.:ext");
    expect(convertPathParams("/a/{1st}/{id.v}")).toBe("/a/:_1st/:id_v");
  });

  it("doubles a colon a specification writes as text, beside a parameter too", () => {
    expect(convertPathParams("/v1/urlInspection/index:inspect")).toBe(
      "/v1/urlInspection/index::inspect",
    );
    expect(convertPathParams("/v4/spreadsheets/{spreadsheetId}:batchUpdate")).toBe(
      "/v4/spreadsheets/:spreadsheetId::batchUpdate",
    );
    expect(convertPathParams("/at/12:30")).toBe("/at/12::30");
  });

  it("keeps a segment Postman starts with a colon as its path variable", () => {
    expect(convertPathParams("/users/:userId/sessions:revoke")).toBe(
      "/users/:userId/sessions::revoke",
    );
  });
});

describe("unwritablePath", () => {
  it("finds a parameter followed at once by a letter, a digit or _", () => {
    expect(unwritablePath("/items/{id}5")).toBe(
      "its parameter {id} is followed by 5, which a path parameter's name would take in, so its operations are left out",
    );
    expect(unwritablePath("/users/{userId}_profile")).toMatch(
      /^its parameter \{userId\} is followed by _/,
    );
  });

  it("finds two parameters whose names come out as one", () => {
    expect(unwritablePath("/a/{a-b}/{a_b}")).toBe(
      "its parameters {a-b} and {a_b} would both be named a_b, so its operations are left out",
    );
  });

  it("writes a path whose parameters stand apart, or one parameter twice", () => {
    expect(unwritablePath("/files/{name}.{ext}")).toBeUndefined();
    expect(unwritablePath("/a/{a}{b}/{id}-x")).toBeUndefined();
    expect(unwritablePath("/a/{id}/b/{id}")).toBeUndefined();
  });
});
