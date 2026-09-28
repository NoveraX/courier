/**
 * `withCourierStudio()` for Next.js, against the config and entries Next.js
 * hands it.
 *
 * Next.js 16 builds with Turbopack and refused to start at all once the
 * wrapper had added a webpack hook. Under webpack it gave the hook its entries
 * as plain lists and paths, which the wrapper did not recognise, so it added
 * nothing.
 */
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { NextConfig } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withCourierStudio } from "../src/plugins/next";

afterEach(() => {
  vi.unstubAllEnvs();
});

type EntryFunction = () => Promise<Record<string, unknown>>;

/** Runs a wrapped config's webpack hook the way Next.js does for the client. */
async function nextClientEntries(
  config: NextConfig,
  entries: Record<string, unknown>,
  dev = true,
) {
  const webpackConfig = { entry: async () => entries };
  const hook = config.webpack as (
    c: typeof webpackConfig,
    ctx: { isServer: boolean; dev: boolean },
  ) => unknown;
  hook(webpackConfig, { isServer: false, dev });
  return (webpackConfig.entry as EntryFunction)();
}

describe("withCourierStudio() for Next.js", () => {
  it("leaves the config alone under Turbopack, where a webpack hook stops Next.js 16", () => {
    vi.stubEnv("TURBOPACK", "auto");
    const config: NextConfig = { reactStrictMode: true };

    expect(withCourierStudio({ enabled: false })(config)).toBe(config);
  });

  it("connects both routers' client entries, in the shapes Next.js 16 gives them", async () => {
    vi.stubEnv("TURBOPACK", "");
    const config = withCourierStudio({ enabled: true })({});

    const entries = await nextClientEntries(config, {
      "main-app": ["./react-refresh.js", "./app-next.js"],
      main: "./next-dev.js",
      "pages/_app": ["./app.js"],
    });

    expect((entries["main-app"] as string[])[0]).toMatch(/^data:text\/javascript;base64,/);
    expect((entries.main as string[])[0]).toBe((entries["main-app"] as string[])[0]);
    expect(entries["pages/_app"]).toEqual(["./app.js"]);
  });

  it("leaves the client entries of a production build alone", async () => {
    vi.stubEnv("TURBOPACK", "");
    const config = withCourierStudio()({});

    const entries = await nextClientEntries(config, { main: "./next.js" }, false);

    expect(entries.main).toBe("./next.js");
  });

  it("still runs the webpack hook the app brought", async () => {
    vi.stubEnv("TURBOPACK", "");
    const own = vi.fn((webpackConfig: unknown) => webpackConfig);

    const config = withCourierStudio({ enabled: false })({ webpack: own });
    await nextClientEntries(config, { main: "./next-dev.js" });

    expect(own).toHaveBeenCalledOnce();
  });
});

type External = (
  data: { context?: string; request?: string },
  callback: (error?: Error | null, result?: string) => void,
) => void;

/** Runs a wrapped config's webpack hook the way Next.js does for a server compile. */
function nextServerExternals(config: NextConfig, nextRuntime: "nodejs" | "edge"): unknown[] {
  const webpackConfig: { externals: unknown[] } = { externals: ["next-own"] };
  const hook = config.webpack as (
    c: typeof webpackConfig,
    ctx: { isServer: boolean; nextRuntime: string },
  ) => unknown;
  hook(webpackConfig, { isServer: true, nextRuntime });
  return webpackConfig.externals;
}

/** What an externals function answers for `request` imported from `context`. */
function answer(external: External, request: string, context: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    external({ request, context }, (error, result) => (error ? reject(error) : resolve(result)));
  });
}

describe("withCourierStudio() for a Next.js server compiled by webpack", () => {
  /* Where engine.io-client, which Studio's socket runs on, imports ws from. */
  const engineDir = dirname(
    createRequire(createRequire(import.meta.url).resolve("socket.io-client")).resolve("engine.io-client"),
  );

  it("loads ws as installed rather than bundling it", async () => {
    vi.stubEnv("TURBOPACK", "");
    const externals = nextServerExternals(withCourierStudio()({}), "nodejs");
    const added = externals.find((item): item is External => typeof item === "function");
    if (!added) throw new Error("no externals function added");

    expect(externals[0]).toBe("next-own");
    expect(await answer(added, "ws", engineDir)).toBe(
      `commonjs ${createRequire(`${engineDir}/`).resolve("ws")}`,
    );
    expect(await answer(added, "react", engineDir)).toBeUndefined();
  });

  it("leaves the edge server's externals alone", () => {
    vi.stubEnv("TURBOPACK", "");

    expect(nextServerExternals(withCourierStudio()({}), "edge")).toEqual(["next-own"]);
  });
});
