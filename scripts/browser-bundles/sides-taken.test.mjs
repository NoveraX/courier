/**
 * Which of the core's server-only modules a build took as they are, and
 * which as their browser stand-ins — wherever the core sits, in the
 * workspace or installed.
 */
import { describe, expect, it } from "vitest";

import { publishedModules, sidesTaken } from "./sides-taken.mjs";

describe("sidesTaken", () => {
  const modules = ["logger/server.js", "utils/forwarded-for.js"];

  it("tells the server's modules from their stand-ins", () => {
    const inputs = [
      "packages/core/lib/logger/server.js",
      "packages/core/lib/browser/utils/forwarded-for.js",
      "packages/core/lib/logger/index.js",
    ];

    expect(sidesTaken(inputs, modules)).toEqual({
      server: ["logger/server.js"],
      browser: ["utils/forwarded-for.js"],
    });
  });

  it("reads the core installed, and a path Windows writes", () => {
    const inputs = [
      "node_modules/@noverax/courier/lib/browser/logger/server.js",
      "node_modules\\@noverax\\courier\\lib\\utils\\forwarded-for.js",
    ];

    expect(sidesTaken(inputs, modules)).toEqual({
      server: ["utils/forwarded-for.js"],
      browser: ["logger/server.js"],
    });
  });

  it("takes another package's module of the same path for neither", () => {
    expect(sidesTaken(["packages/studio-core/lib/logger/server.js"], modules)).toEqual({
      server: [],
      browser: [],
    });
  });
});

describe("publishedModules", () => {
  it("names the core's modules a build took by their path under lib, installed or in the workspace", () => {
    const inputs = [
      "node_modules/@noverax/courier/lib/client/index.js",
      "/repo/packages/core/lib/adapter/limits.js",
      "C:\\repo\\packages\\core\\lib\\server\\sources.js",
      "page.js",
      "packages/studio-core/lib/logger/server.js",
    ];

    expect(publishedModules(inputs)).toEqual([
      "client/index.js",
      "adapter/limits.js",
      "server/sources.js",
    ]);
  });
});
