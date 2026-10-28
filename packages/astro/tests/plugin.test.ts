/**
 * @vitest-environment node
 *
 * `@noverax/courier-astro/plugin`: the integration that hands Astro's Vite
 * the plugin that builds the routes a page's proxy client may call.
 */
import { describe, expect, it } from "vitest";

import { courierRoutesIntegration } from "../src/plugin";

describe("courierRoutesIntegration, the Astro integration", () => {
  it("adds the routes plugin to Astro's Vite config, under every command", () => {
    const updates: unknown[] = [];
    const integration = courierRoutesIntegration({ config: "config/courier.config.ts" });

    integration.hooks["astro:config:setup"]({ updateConfig: (config) => updates.push(config) });

    expect(integration.name).toBe("courier-routes");
    expect(updates).toEqual([
      { vite: { plugins: [expect.objectContaining({ name: "courier-routes" })] } },
    ]);
  });
});
