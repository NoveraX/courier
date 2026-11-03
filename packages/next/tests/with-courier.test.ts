/**
 * @vitest-environment node
 *
 * `withCourier` as an app's `next.config` calls it: an inline object of the
 * app's own keys, from the folder Next.js runs in, and a config written as
 * a function refused. Requires a build of `@noverax/courier-build` first.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { withCourier } from "../src/with-courier";
import { type RoutesApp, routesApp } from "./fixtures/routes-app";

let app: RoutesApp | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  app?.remove();
  app = undefined;
});

describe("withCourier", () => {
  it("takes an object of the app's own keys, written inline, and keeps them", () => {
    app = routesApp();
    vi.spyOn(process, "cwd").mockReturnValue(app.root);

    const config = withCourier({ reactStrictMode: true });

    expect(config.reactStrictMode).toBe(true);
    expect(config.transpilePackages).toEqual(["@noverax/courier"]);
  });

  it("refuses a config written as a function, which would leave Next.js with none", () => {
    app = routesApp();
    vi.spyOn(process, "cwd").mockReturnValue(app.root);
    const written = () => ({ reactStrictMode: true });

    // @ts-expect-error a config written as a function passes the object it returns
    expect(() => withCourier(written)).toThrow(
      "withCourier() takes the config's object: a config written as a function calls it on the object it returns",
    );
  });
});
