import type { ServerOps } from "./lifecycle-server-ops";
import type { ServerState } from "./types";

type Operation = "startServer" | "stopServer" | "restartServer";

const FOR_ONE: Readonly<Record<string, Operation>> = {
  "mock:managed:start": "startServer",
  "mock:managed:stop": "stopServer",
  "mock:managed:restart": "restartServer",
};

const FOR_ALL: Readonly<Record<string, Operation>> = {
  "mock:managed:startAll": "startServer",
  "mock:managed:stopAll": "stopServer",
};

/**
 * Build the handler for the lifecycle commands the Mocks view sends.
 *
 * @param servers - The tracked mocks, by key
 * @param ops - Start, stop and restart, queued per mock
 * @param runVoid - Runs an operation whose failure is logged, not thrown
 * @returns Handles one command; an unknown one, or one for a mock it does not name, is ignored
 */
export function createCommandHandler(
  servers: ReadonlyMap<string, ServerState>,
  ops: Pick<ServerOps, Operation>,
  runVoid: (label: string, promise: Promise<unknown>) => void,
): (command: string, data: Record<string, unknown>) => void {
  const run = (operation: Operation, serverId: string) =>
    runVoid(`${operation}(${serverId})`, ops[operation](serverId));
  return (command, data) => {
    const forAll = Object.hasOwn(FOR_ALL, command) ? FOR_ALL[command] : undefined;
    if (forAll) {
      for (const id of servers.keys()) run(forAll, id);
      return;
    }
    const forOne = Object.hasOwn(FOR_ONE, command) ? FOR_ONE[command] : undefined;
    if (forOne && typeof data.serverId === "string") run(forOne, data.serverId);
  };
}
