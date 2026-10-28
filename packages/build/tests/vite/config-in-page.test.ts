/**
 * @vitest-environment node
 *
 * The project's config refused as a module of a page, which would ship the
 * server's settings and every API's definition to the browser; a server's
 * module may import it, and every other module is left alone.
 */
import { describe, expect, it } from "vitest";

import { refuseConfigInPage, type TransformContext } from "../../src/vite/config-in-page";

const CONFIG = "/app/courier.config.ts";

function context(consumer?: "client" | "server"): TransformContext & { refused: string[] } {
  const refused: string[] = [];
  return {
    refused,
    ...(consumer !== undefined && { environment: { config: { consumer } } }),
    error(message: string): never {
      refused.push(message);
      throw new Error(message);
    },
  };
}

describe("refuseConfigInPage", () => {
  it("refuses the config in a page's module, naming it and what to write instead", () => {
    const page = context("client");

    expect(() => refuseConfigInPage(page, CONFIG, undefined, CONFIG)).toThrow();

    expect(page.refused[0]).toContain("courier.config.ts is imported into a page as a value");
    expect(page.refused[0]).toContain("`import type config from`");
  });

  it("refuses it under a query Vite adds to the module's id", () => {
    expect(() =>
      refuseConfigInPage(context("client"), `${CONFIG}?import`, undefined, CONFIG),
    ).toThrow();
  });

  it("lets a server's module import the config", () => {
    const server = context("server");

    refuseConfigInPage(server, CONFIG, undefined, CONFIG);

    expect(server.refused).toEqual([]);
  });

  it("tells a page's module from a server's by `ssr` on a Vite before 6", () => {
    expect(() => refuseConfigInPage(context(), CONFIG, { ssr: false }, CONFIG)).toThrow();
    expect(() => refuseConfigInPage(context(), CONFIG, { ssr: true }, CONFIG)).not.toThrow();
  });

  it("leaves every other module alone, and does nothing with no config found", () => {
    expect(() =>
      refuseConfigInPage(context("client"), "/app/src/apis.ts", undefined, CONFIG),
    ).not.toThrow();
    expect(() => refuseConfigInPage(context("client"), CONFIG, undefined, undefined)).not.toThrow();
  });
});
