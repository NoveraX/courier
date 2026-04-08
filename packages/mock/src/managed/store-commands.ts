/**
 * Handle store-related commands from the Studio parent process.
 */

import type { RouteInfo } from "../auto/route-analyzer";
import type { MockServer } from "../server/create-mock-server";

export type CmdResult = { ok: boolean; data?: unknown; error?: string };

export async function handleStoreCommand(
  server: MockServer,
  routes: RouteInfo[],
  cmd: Record<string, unknown>,
): Promise<CmdResult> {
  try {
    const action = cmd.action as string;
    const collection = cmd.collection as string;

    switch (action) {
      case "mock:scenario:apply": {
        const name = cmd.scenario as string;
        const scenario = server.scenarios[name];
        if (!scenario) return { ok: false, error: `Scenario "${name}" not found` };
        server.applyScenario(scenario);
        return { ok: true, data: { applied: name } };
      }
      case "mock:store:seed": {
        const count = (cmd.count as number) ?? 20;
        const { seedAllCollections } = await import("../auto/auto-scenario");
        seedAllCollections(routes, server.store, { seedCount: count });
        return { ok: true };
      }
      case "mock:store:delete":
        return handleDelete(server, collection, cmd.id as string | number);
      case "mock:store:create": {
        const record = cmd.record as Record<string, unknown>;
        const col = server.store.collection(collection);
        return { ok: true, data: col.create(record) };
      }
      case "mock:store:update": {
        const col = server.store.collection(collection);
        col.update((q) => q.where({ id: cmd.id } as Record<string, unknown>), {
          data: cmd.data as Record<string, unknown>,
        });
        return { ok: true };
      }
      case "mock:server:reset":
        server.store.reset();
        server.history.length = 0;
        server.networkState.setConfig(undefined);
        return { ok: true, data: { reset: true } };
      default:
        return { ok: false, error: `Unknown command: ${action}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function handleDelete(server: MockServer, collection: string, rawId: string | number): CmdResult {
  if (rawId === "*") {
    server.store.collection(collection).clear();
    return { ok: true };
  }
  const id = parseId(rawId);
  server.store.collection(collection).delete((q) => q.where({ id } as Record<string, unknown>));
  return { ok: true };
}

/** Convert string id to number if numeric, for strict equality matching */
function parseId(raw: string | number): string | number {
  if (typeof raw === "number") return raw;
  const num = Number(raw);
  return Number.isNaN(num) ? raw : num;
}
