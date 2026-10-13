/**
 * The apps attached to Studio, each with the origin it is served at: the one
 * the runtime said — a page's, an app's — else one a bound source reports.
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

  it("takes the origin the runtime said, a browser page's among them, before a bound source's", () => {
    const apps = attachedApps({
      runtimeCount: 2,
      sourceCount: 1,
      runtimes: [
        { runtimeId: "next-browser", kind: "browser", origin: "http://localhost:3000" },
        { runtimeId: "next-server", kind: "server", origin: "http://localhost:3000" },
      ],
      rows: [
        {
          sourceName: "api",
          transport: "http",
          status: "bound",
          runtimeId: "next-server",
          appOrigin: "http://127.0.0.1:3000",
        },
      ],
    });

    expect(apps).toEqual([
      { id: "next-browser", kind: "browser", origin: "localhost:3000" },
      { id: "next-server", kind: "server", origin: "localhost:3000" },
    ]);
  });
});
