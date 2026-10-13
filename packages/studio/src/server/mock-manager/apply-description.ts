import { basename } from "node:path";
import { createLogger } from "@noverax/courier";
import type { MockEntry } from "../mock-registry";
import { describeEntry } from "./describe-entry";
import type { ServerOps } from "./lifecycle-server-ops";
import type { MockRegistration } from "./mock-registration";
import type { ServerState } from "./types";

const log = createLogger("Studio");

export interface ApplyContext {
  servers: Map<string, ServerState>;
  registration: MockRegistration;
  ops: ServerOps;
  /** The mocks file that last loaded, or `null` when none has. */
  getMocksPath: () => string | null;
  /** The project root, links resolved: a mock's problems name its files relative to it. */
  projectRoot: string;
  isAlive: (serverId: string) => boolean;
  /** Whether the registry still holds this very entry, after an await. */
  isCurrent: (entry: MockEntry) => boolean;
  isClosed: () => boolean;
}

/**
 * Build the step that brings a mock in line with the definition the mocks
 * file now declares for it.
 *
 * A mock whose process is alive restarts, so it serves what the config now
 * says. `autoStart` starts a mock when its definition is first read, or when
 * an edit turns it on; every reload re-evaluates the mocks file, so applying
 * it on each would start again a mock the developer stopped.
 *
 * @param ctx - The coordinator's state and operations
 * @returns Applies one registry entry
 */
export function createDescriptionApplier(ctx: ApplyContext): (entry: MockEntry) => Promise<void> {
  const { registration, ops } = ctx;

  return async function apply(entry: MockEntry): Promise<void> {
    const mocksFile = ctx.getMocksPath();
    if (!mocksFile) {
      log.warn(`Cannot register mock "${entry.key}": courier.mocks.ts has not loaded`);
      return;
    }
    const described = await describeEntry(entry.key, entry.definition, ctx.projectRoot);
    if (ctx.isClosed() || !ctx.isCurrent(entry)) return;
    const location = { mocksFile, relativePath: `${basename(mocksFile)}:${entry.key}` };

    if ("problem" in described) {
      log.error(
        registration.registerProblem(entry.key, location, entry.definition, described.problem),
      );
      return;
    }
    const { description } = described;
    const state = ctx.servers.get(entry.key);
    if (!state) {
      registration.registerDeclared(entry.key, location, description, entry.source);
      if (description.autoStart) await ops.startServer(entry.key);
      return;
    }
    const startedAtLaunch = state.autoStart;
    registration.updateDeclared(entry.key, location, description, entry.source);
    if (ctx.isAlive(entry.key)) await ops.restartServer(entry.key);
    else if (description.autoStart && !startedAtLaunch) await ops.startServer(entry.key);
  };
}
