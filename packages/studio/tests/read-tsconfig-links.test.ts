import { describe, expect, it } from "vitest";
import { readTsconfigLinks } from "../src/server/read-tsconfig-links";

describe("readTsconfigLinks", () => {
  it("reads a single extends and a declared paths map", () => {
    const links = readTsconfigLinks(
      JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    );

    expect(links).toEqual({ extends: ["./tsconfig.base.json"], declaresPaths: true });
  });

  it("reads an extends array in the order written, an entry that is no string as null", () => {
    const links = readTsconfigLinks('{ "extends": ["./a.json", 1, "@acme/tsconfig"] }');

    expect(links).toEqual({ extends: ["./a.json", null, "@acme/tsconfig"], declaresPaths: false });
  });

  it("reads an extends that is neither a string nor an array as one entry that is no string", () => {
    expect(readTsconfigLinks('{ "extends": 5 }').extends).toEqual([null]);
    expect(readTsconfigLinks('{ "extends": { "path": "./a.json" } }').extends).toEqual([null]);
    expect(readTsconfigLinks('{ "extends": null }').extends).toEqual([]);
  });

  it("reads JSON5 as a hand-edited tsconfig carries it", () => {
    const text = [
      "﻿{",
      "  // shared settings",
      "  extends: './tsconfig.base.json',",
      "  /* aliases */",
      "  compilerOptions: { paths: { '@/*': ['./src/*'], }, },",
      "} // trailing comment",
    ].join("\n");

    expect(readTsconfigLinks(text)).toEqual({ extends: ["./tsconfig.base.json"], declaresPaths: true });
  });

  it("counts the last of a key written twice", () => {
    const links = readTsconfigLinks('{ "extends": "./first.json", "extends": "./second.json" }');

    expect(links.extends).toEqual(["./second.json"]);
  });

  it("does not count paths set to null, or compilerOptions without paths", () => {
    expect(readTsconfigLinks('{ "compilerOptions": { "paths": null } }').declaresPaths).toBe(false);
    expect(readTsconfigLinks('{ "compilerOptions": { "strict": true } }').declaresPaths).toBe(false);
  });

  it("counts paths set to any truthy value, as the reader does, and no falsy one", () => {
    const declares = (paths: string) => readTsconfigLinks(`{ compilerOptions: { paths: ${paths} } }`).declaresPaths;

    expect(["[]", "'./src/*'", "1", "true", "Infinity", "-1", "+Infinity"].map(declares)).toEqual(Array(7).fill(true));
    expect(["0", "''", "false", "NaN", "-0", "-NaN"].map(declares)).toEqual(Array(6).fill(false));
  });

  it("reads nothing from a text that is no object", () => {
    const none = { extends: [], declaresPaths: false };

    expect(readTsconfigLinks('{ "extends": "./a.json"')).toEqual(none);
    expect(readTsconfigLinks('["./a.json"]')).toEqual(none);
    expect(readTsconfigLinks("")).toEqual(none);
    expect(readTsconfigLinks('{}) + ({ "extends": "./a.json" }')).toEqual(none);
  });
});
