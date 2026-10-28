/**
 * @vitest-environment node
 *
 * The module a page's bundle takes in place of `@noverax/courier/routes`:
 * the routes as data, or, when they were never read, a module that fails
 * where it is imported with the reason.
 */
import { describe, expect, it } from "vitest";

import { routesModuleCode, unreadRoutesModuleCode } from "../../src/engine/routes-module-code";
import type { RoutesSnapshot } from "../../src/engine/routes-snapshot";

const snapshot: RoutesSnapshot = {
  configFile: "/app/courier.config.ts",
  routes: {
    payments: { source: "payments", endpoints: {} },
    shop: { source: "shop", endpoints: { "cart.add": { type: "mutation" } }, coalesce: true },
  },
  files: ["/app/courier.config.ts"],
  env: [],
};

async function importCode(code: string): Promise<{ routes: unknown }> {
  return import(`data:text/javascript,${encodeURIComponent(code)}`);
}

describe("routesModuleCode", () => {
  it("exports the routes of every source, as the config gave them", async () => {
    const module = await importCode(routesModuleCode(snapshot));

    expect(module.routes).toEqual(snapshot.routes);
  });
});

describe("unreadRoutesModuleCode", () => {
  it("fails where it is imported, with the reason the routes were not read", async () => {
    const code = unreadRoutesModuleCode("courier.config.ts did not load: no such file ./apis");

    await expect(importCode(code)).rejects.toThrow(
      "[courier] courier.config.ts did not load: no such file ./apis",
    );
  });

  it("still exports routes, so a module that imports it links and the reason is what shows", () => {
    const code = unreadRoutesModuleCode("not read");

    expect(code).toMatch(/export const routes = \{\};/);
  });
});
