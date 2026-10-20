/**
 * A specification's hash: the one recorded before for the same
 * specification, as every recorded hash is compared with it, and one for a
 * specification nested deeper than JSON.stringify's recursion goes on some
 * platforms, where hashing it failed every write and update of it: the same
 * hash whichever way its text is written, so a hash recorded on one version
 * of Node is the one another gives.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseSpec } from "../../../src/apis/parser";
import type { ParsedSchema, ParsedSpec } from "../../../src/apis/parser/types";
import { computeSpecHash } from "../../../src/apis/registry/spec-hash";
import { writeJsonText } from "../../../src/apis/registry/write-json-text";

const ROOT = new URL("../../../../../", import.meta.url);

function hashed(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

/* The hash as it was written, with JSON.stringify alone. */
function recordedHash(spec: ParsedSpec): string {
  const { title, version, groups, schemas, securitySchemes } = spec;
  return hashed(JSON.stringify({ title, version, groups, schemas, securitySchemes }));
}

/* The hash of the same text written without recursion, as past JSON.stringify's depth. */
function writtenHash(spec: ParsedSpec): string {
  const { title, version, groups, schemas, securitySchemes } = spec;
  const pieces: string[] = [];
  writeJsonText({ title, version, groups, schemas, securitySchemes }, (piece) => {
    pieces.push(piece);
  });
  return hashed(pieces.join(""));
}

function deep(levels: number): ParsedSpec {
  let schema: ParsedSchema = { name: "Leaf", type: "string" };
  for (let at = 0; at < levels; at += 1) {
    schema = {
      name: `Level${at}`,
      type: "object",
      properties: { next: { required: false, type: "object", shape: schema } },
      required: [],
    };
  }
  return {
    title: "Deep",
    version: "1",
    description: "",
    baseURL: "/",
    format: "openapi3",
    groups: [],
    schemas: { Deep: schema },
    securitySchemes: [],
    skipped: [],
  };
}

describe("computeSpecHash", () => {
  it.each([
    [
      "packages/studio/tests/fixtures/generator/kitchen-sink.json",
      "b546741a2b9043367c0fbe7c5be128ea",
    ],
    ["e2e/fixtures/specs/billing.v1.json", "503217d1531b3e5aa795c24ebea41e43"],
    ["e2e/fixtures/specs/billing.v2.json", "40a641e75d50499e28b7c2b7440b0bb0"],
  ])("gives %s the hash recorded for it", (file, hash) => {
    expect(computeSpecHash(parseSpec(readFileSync(new URL(file, ROOT), "utf8")))).toBe(hash);
  });

  it("gives the hash JSON.stringify gave, where it could", () => {
    expect(computeSpecHash(deep(500))).toBe(recordedHash(deep(500)));
  });

  it("hashes a specification nested 20 000 deep the same each time, whichever way its text is written", () => {
    const hash = computeSpecHash(deep(20_000));

    expect(hash).toBe(writtenHash(deep(20_000)));
    expect(computeSpecHash(deep(20_000))).toBe(hash);
    expect(computeSpecHash(deep(19_999))).not.toBe(hash);
  });
});
