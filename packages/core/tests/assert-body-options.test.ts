/**
 * A handler's options for request bodies, refused where the handler is
 * made when they could not work as written.
 */
import { describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import type { HandlerConfig } from "../src/adapter/handler-config";

describe("createHandler's options for request bodies", () => {
  it("takes every one of them set as it may be", () => {
    expect(() =>
      createHandler({
        uploadMode: "memory",
        uploadMemoryBytes: 0,
        totalUploadMemoryBytes: 0,
        totalUploadDiskBytes: 1,
        uploadDirectory: "/var/uploads",
        maxUploadParts: 1,
        bodyIdleTimeoutMs: 1,
        bodyTimeoutMs: 2_147_483_647,
      }),
    ).not.toThrow();
  });

  it.each([
    [
      "an upload mode it does not have",
      { uploadMode: "disk" },
      'uploadMode is "auto", "memory" or "stream"',
    ],
    ["a share of memory below 0", { uploadMemoryBytes: -1 }, "uploadMemoryBytes"],
    ["a share of memory that is not whole", { uploadMemoryBytes: 1.5 }, "uploadMemoryBytes"],
    ["room in memory below 0", { totalUploadMemoryBytes: -1 }, "totalUploadMemoryBytes"],
    ["room on disk that is not whole", { totalUploadDiskBytes: 0.5 }, "totalUploadDiskBytes"],
    ["an empty upload folder", { uploadDirectory: "" }, "uploadDirectory names a folder"],
    ["no parts at all", { maxUploadParts: 0 }, "maxUploadParts"],
    ["a pause of no time", { bodyIdleTimeoutMs: 0 }, "bodyIdleTimeoutMs"],
    ["a wait no timer keeps", { bodyTimeoutMs: 2_147_483_648 }, "bodyTimeoutMs"],
    ["a wait without end", { bodyTimeoutMs: Number.POSITIVE_INFINITY }, "bodyTimeoutMs"],
  ])("refuses %s", (_case, options, named) => {
    expect(() => createHandler(options as HandlerConfig)).toThrow(
      expect.objectContaining({
        code: "BODY_OPTIONS_INVALID",
        message: expect.stringContaining(named),
      }),
    );
  });
});
