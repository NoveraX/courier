/**
 * Which text is read as a specification, in the forms editors and exports
 * actually save it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { detectFormat, parseSpec } from "../../../src/apis/parser";

const PETSTORE = {
  openapi: "3.0.4",
  info: { title: "Petstore", version: "1" },
  servers: [{ url: "/api/v3" }],
  paths: {
    "/pets": {
      get: { tags: ["pets"], operationId: "listPets", responses: { "200": { description: "ok" } } },
    },
  },
};

const BOM = "﻿";

const YAML = [
  "info:",
  "  title: Petstore",
  '  version: "1"',
  "servers:",
  "  - url: /api/v3",
  "paths:",
  "  /pets:",
  "    get:",
  "      tags: [pets]",
  "      operationId: listPets",
  "      responses:",
  '        "200":',
  "          description: ok",
].join("\n");

describe("a specification saved with a byte order mark", () => {
  it("is read as JSON", () => {
    const text = `${BOM}${JSON.stringify(PETSTORE)}`;

    expect(detectFormat(text)).toBe("openapi3-json");
    expect(parseSpec(text).groups[0]?.endpoints[0]?.name).toBe("listPets");
  });

  it("is read as YAML", () => {
    const text = `${BOM}openapi: 3.0.4\n${YAML}`;

    expect(parseSpec(text).groups[0]?.endpoints[0]?.name).toBe("listPets");
  });
});

describe("a YAML specification whose version key is quoted", () => {
  it.each(['"openapi": 3.0.4', "'openapi': 3.0.4"])("is read when written %s", (key) => {
    const text = `${key}\n${YAML}`;

    expect(detectFormat(text)).toBe("openapi3-yaml");
    expect(parseSpec(text).groups[0]?.endpoints[0]?.name).toBe("listPets");
  });

  it("is read when the key comes after the others, with Windows line endings", () => {
    const text = `${YAML}\n"openapi": 3.0.4\n`.replace(/\n/g, "\r\n");

    expect(parseSpec(text).groups[0]?.endpoints[0]?.name).toBe("listPets");
  });

  it("is not found in a nested key of that name", () => {
    expect(detectFormat(`info:\n  "openapi": 3.0.4\n`)).toBe("unknown");
  });
});

describe("a JSON specification whose version is a number", () => {
  it("is read", () => {
    expect(detectFormat(JSON.stringify({ ...PETSTORE, openapi: 3.1 }))).toBe("openapi3-json");
  });
});

describe("a JSON specification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* Read once to tell its format and again to parse it, Stripe's 7 MB took twice as long. */
  it("is read once", () => {
    const text = JSON.stringify(PETSTORE);
    const parse = vi.spyOn(JSON, "parse");

    parseSpec(text);

    expect(parse.mock.calls.filter(([argument]) => argument === text)).toHaveLength(1);
  });
});
