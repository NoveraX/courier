/**
 * The apps attached to Studio, each with the origin one of its bound
 * sources reports.
 */
import { describe, expect, it } from "vitest";

import { attachedApps } from "@/features/runtimes/attached-apps";

describe("attachedApps", () => {
  it("names each runtime with its kind and the origin it serves at, without the scheme", () => {
    const apps = attachedApps({
      runtimeCount: 2,
      sourceCount: 1,
      runtimes: [
        { runtimeId: "vite-browser", kind: "browser" },
        { runtimeId: "next-server", kind: "server" },
      ],
      rows: [
        {
          sourceName: "api",
          transport: "http",
          status: "bound",
          runtimeId: "vite-browser",
          appOrigin: "http://localhost:5173/",
        },
      ],
    });

    expect(apps).toEqual([
      { id: "vite-browser", kind: "browser", origin: "localhost:5173" },
      { id: "next-server", kind: "server", origin: undefined },
    ]);
  });
});
