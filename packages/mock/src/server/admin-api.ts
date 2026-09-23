import { logger } from "@noverax/courier";
import type { Hono } from "hono";
import type { MockRegistry } from "../registry";
import type { MockStore } from "../store";
import type { MockHistoryEntry, MockScenario } from "../types";

interface AdminConfig {
  registry: MockRegistry;
  history: MockHistoryEntry[];
  store: MockStore;
  scenarios: Map<string, MockScenario>;
  getScenarioState: () => string;
  setScenarioState: (state: string) => void;
  getActiveScenario: () => string | null;
  setActiveScenario: (name: string | null) => void;
  applyScenario: (scenario: MockScenario) => void;
  /** Re-seed all collections after reset — provided by createAutoMockServer */
  reseed?: () => void;
}

/**
 * Register admin API routes under /__admin/
 *
 * A request a browser sends from a page on another site is refused: the
 * admin API has no authentication, and with the mock's open CORS any page
 * the developer had open could read the store, wipe it or switch every
 * endpoint to 500. Tools and scripts send no `Origin`; pages served from
 * this machine (Studio, a local dashboard) are loopback origins.
 */
export function registerAdminRoutes(app: Hono, config: AdminConfig): void {
  app.use("/__admin/*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (origin && !isLoopbackOrigin(origin)) {
      return c.json({ error: "The admin API only answers pages served from this machine" }, 403);
    }
    await next();
    return undefined;
  });

  // List active mocks
  app.get("/__admin/mocks", (c) => {
    return c.json(config.registry.list());
  });

  // List available scenarios
  app.get("/__admin/scenarios", (c) => {
    const names = [...config.scenarios.keys()];
    return c.json({
      scenarios: names,
      current: config.getActiveScenario(),
      state: config.getScenarioState(),
    });
  });

  // Activate a scenario
  app.post("/__admin/scenarios/:name", (c) => {
    const name = c.req.param("name");
    const scenario = config.scenarios.get(name);
    if (!scenario) {
      return c.json({ error: `Unknown scenario "${name}"` }, 404);
    }
    config.applyScenario(scenario);
    config.setActiveScenario(name);
    return c.json({ applied: name });
  });

  // Reset scenario state
  app.post("/__admin/scenarios/reset", (c) => {
    config.setScenarioState("Started");
    return c.json({ state: "Started" });
  });

  // Request history
  app.get("/__admin/history", (c) => {
    const limit = Number(new URL(c.req.url).searchParams.get("limit")) || 100;
    return c.json(config.history.slice(-limit));
  });

  // Reset everything — clears registry, history, store, then re-seeds
  app.post("/__admin/reset", (c) => {
    config.registry.clear();
    config.history.length = 0;
    config.store.reset();
    config.reseed?.();
    config.setScenarioState("Started");
    return c.json({ reset: true });
  });

  // Store: list collections
  app.get("/__admin/store", (c) => {
    return c.json(config.store.list());
  });

  // Store: browse collection
  app.get("/__admin/store/:collection", (c) => {
    const name = c.req.param("collection");
    if (!config.store.has(name)) {
      return c.json({ error: `Collection "${name}" not found` }, 404);
    }
    const col = config.store.collection(name);
    return c.json(col.getAll());
  });

  // Health check
  app.get("/__admin/health", (c) => {
    return c.json({
      status: "ok",
      mocks: config.registry.list().length,
      history: config.history.length,
      collections: config.store.list().length,
    });
  });
}

/** An origin on this machine: `localhost`, a `*.localhost` name, or a loopback address */
function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  } catch (error) {
    logger.debug("MockAdmin", `Unreadable Origin "${origin}": ${String(error)}`);
    return false;
  }
}
