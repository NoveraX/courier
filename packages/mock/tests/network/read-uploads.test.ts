import { describe, expect, it } from "vitest";

import { readRouteUploads, readUploads } from "../../src/network/read-uploads";

describe("upload conditions as a command names them", () => {
  it("keep a speed and a size limit above 0, and the types trimmed", () => {
    expect(
      readUploads({ bandwidth: 1500, maxBytes: 1_048_576.7, accept: [" image/* ", ".pdf"] }),
    ).toEqual({
      bandwidth: 1500,
      maxBytes: 1_048_576,
      accept: ["image/*", ".pdf"],
    });
  });

  it("are none when they set nothing, so a command can clear them", () => {
    expect(readUploads({ bandwidth: 0, maxBytes: -1 })).toBeUndefined();
    expect(readUploads({})).toBeUndefined();
    expect(readUploads(null)).toBeUndefined();
    expect(readUploads([1])).toBeUndefined();
  });

  it("drop types that are not text or are blank, and keep a list left empty", () => {
    expect(readUploads({ accept: ["image/*", 3, "", "  "] })).toEqual({ accept: ["image/*"] });
    expect(readUploads({ accept: [] })).toEqual({ accept: [] });
  });
});

describe("a route's own upload conditions", () => {
  it("are its size limit and types, never a speed of its own", () => {
    expect(readRouteUploads({ bandwidth: 512, maxBytes: 2048, accept: ["image/*"] })).toEqual({
      maxBytes: 2048,
      accept: ["image/*"],
    });
    expect(readRouteUploads({ bandwidth: 512 })).toBeUndefined();
  });
});
