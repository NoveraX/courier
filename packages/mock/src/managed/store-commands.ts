/**
 * Handle store-related commands from the Studio parent process.
 */

import { seedAllCollections } from "../auto/auto-seed";
import type { MockServer } from "../server/mock-server-types";
import { CommandInputError, countIn, idIn, nameIn, objectIn } from "./command-input";
import { generatedRecord } from "./generated-record";
import type { ServedMock } from "./types";

export type CmdResult = { ok: boolean; data?: unknown; error?: string };

/**
 * Run a scenario, store or reset command on a served mock.
 *
 * A command whose fields are missing or of the wrong kind is refused with a
 * message naming the field, and changes nothing.
 *
 * @param served - The mock the command is for
 * @param cmd - The command, as Studio sent it
 * @returns Whether it ran, with its data or the reason it did not
 * @example
 * ```ts
 * handleStoreCommand(served, { action: "mock:store:seed", collection: "*" });
 * ```
 */
export function handleStoreCommand(served: ServedMock, cmd: Record<string, unknown>): CmdResult {
  const { server } = served;
  try {
    switch (cmd.action) {
      case "mock:scenario:apply":
        return applyScenario(server, nameIn(cmd, "scenario"));
      case "mock:store:seed":
        return seed(served, cmd);
      case "mock:store:delete":
        return handleDelete(server, nameIn(cmd, "collection"), idIn(cmd, "id"));
      case "mock:store:create": {
        const collection = nameIn(cmd, "collection");
        const col = server.store.collection(collection);
        /* Without a record, one is made as the seed makes them, so it answers as the schema says. */
        const record =
          cmd.record === undefined
            ? generatedRecord(served, collection, col)
            : objectIn(cmd, "record");
        return { ok: true, data: col.create(record) };
      }
      case "mock:store:update":
        return update(server, nameIn(cmd, "collection"), idIn(cmd, "id"), objectIn(cmd, "data"));
      /* Studio's "Reset store": the store alone, emptied and seeded again as
         the mock declares. The network settings stay as they are: switching
         them off without telling Studio left it showing them active while
         requests went through. */
      case "mock:server:reset":
        server.store.reset();
        seedAllCollections(served.routes, server.store, served.seed);
        return { ok: true, data: { reset: true } };
      default:
        return { ok: false, error: `Unknown command: ${String(cmd.action)}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* A scenario is one the mock declares under that name — never a property
   every object inherits, such as "constructor". */
function applyScenario(server: MockServer, name: string): CmdResult {
  const scenario = Object.hasOwn(server.scenarios, name) ? server.scenarios[name] : undefined;
  if (!scenario) return { ok: false, error: `Scenario "${name}" not found` };
  server.applyScenario(scenario);
  return { ok: true, data: { applied: name } };
}

/**
 * Seed every collection (`collection` "*" or none) or the one named. A count
 * given applies to each; without one, each gets the count the mock declares.
 */
function seed(served: ServedMock, cmd: Record<string, unknown>): CmdResult {
  const count = countIn(cmd, "count");
  const all = cmd.collection === undefined || cmd.collection === "*";
  const collection = all ? "*" : nameIn(cmd, "collection");
  const routes = all ? served.routes : served.routes.filter((r) => r.group === collection);
  if (routes.length === 0) {
    throw new CommandInputError(`Collection "${collection}" is not one this mock serves`);
  }
  const options = count === undefined ? served.seed : { seedCount: count };
  seedAllCollections(routes, served.server.store, options);
  return { ok: true, data: { seeded: collection } };
}

/* A record that is not there is said so, rather than reported as changed. */
function update(
  server: MockServer,
  collection: string,
  id: string | number,
  data: Record<string, unknown>,
): CmdResult {
  const updated = server.store.collection(collection).updateById(id, data);
  return updated ? { ok: true } : noRecord(collection, id);
}

function handleDelete(server: MockServer, collection: string, rawId: string | number): CmdResult {
  if (rawId === "*") {
    server.store.collection(collection).clear();
    return { ok: true };
  }
  return server.store.collection(collection).deleteById(rawId)
    ? { ok: true }
    : noRecord(collection, rawId);
}

function noRecord(collection: string, id: string | number): CmdResult {
  return { ok: false, error: `${collection} has no record with id ${JSON.stringify(id)}` };
}
