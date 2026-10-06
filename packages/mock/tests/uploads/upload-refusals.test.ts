import { describe, expect, it } from "vitest";

import { sizeLabel } from "../../src/uploads/size-label";
import { oversizeRefusal, typeRefusal } from "../../src/uploads/upload-refusals";

describe("the refusal of an upload over the size the mock takes", () => {
  it("is a 413 naming the upload's size and the limit", () => {
    expect(oversizeRefusal(3_355_443, 1_048_576)).toEqual({
      status: 413,
      error: "The upload is 3.2 MB, over the 1 MB the mock takes",
    });
  });

  it("names only the limit when the request did not declare its size", () => {
    expect(oversizeRefusal(undefined, 262_144)).toEqual({
      status: 413,
      error: "The upload is over the 256 KB the mock takes",
    });
  });
});

describe("the refusal of an upload holding a file of a type not taken", () => {
  it("is a 415 naming the first such file, its type, and the types taken", () => {
    const files = [
      { name: "a.png", type: "image/png", size: 1 },
      { name: "b.heic", type: "image/heic", size: 2 },
      { name: "c.txt", type: "text/plain", size: 3 },
    ];

    expect(typeRefusal(files, ["image/png", ".pdf"])).toEqual({
      status: 415,
      error: "b.heic (image/heic) is not a type the mock takes: image/png, .pdf",
    });
  });

  it("names raw bytes by their type, and a file with no type as such", () => {
    expect(typeRefusal([{ name: "", type: "application/zip", size: 9 }], ["image/*"])?.error).toBe(
      "An upload of application/zip is not a type the mock takes: image/*",
    );
    expect(typeRefusal([{ name: "notes", type: "", size: 9 }], ["image/*"])?.error).toBe(
      "notes (no type) is not a type the mock takes: image/*",
    );
  });

  it("is none when every file is taken, or the upload holds none", () => {
    expect(
      typeRefusal([{ name: "a.png", type: "image/png", size: 1 }], ["image/*"]),
    ).toBeUndefined();
    expect(typeRefusal([], ["image/*"])).toBeUndefined();
  });
});

describe("a size as people say it", () => {
  it("is in kilobytes below a megabyte and megabytes from one, to a tenth", () => {
    expect([512, 65_536, 1_048_576, 10_485_760, 3_355_443].map(sizeLabel)).toEqual([
      "0.5 KB",
      "64 KB",
      "1 MB",
      "10 MB",
      "3.2 MB",
    ]);
  });
});
