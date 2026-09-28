/**
 * `withCourierStudio()` for Next.js, against the config and entries Next.js
 * hands it.
 *
 * Next.js 16 builds with Turbopack and refused to start at all once the
 * wrapper had added a webpack hook. Under webpack it gave the hook its entries
 * as plain lists and paths, which the wrapper did not recognise, so it added
 * nothing.
 */
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
