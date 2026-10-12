import type { Socket } from "socket.io";

import { isPlainObject } from "./is-plain-object";
import type { LifecycleCoordinator } from "./mock-manager";

/** A mock's store as a page that shows it is sent it: its records, and which store they are. */
export type MockStoreReply =
  | {
      ok: true;
      serverId: string;
      /** When the mock started: a store of another start is another store */
      startedAt: number;
      /** The number of the last report of the store these records follow */
      storeSeq: number;
      collections: ReadonlyArray<{ name: string; count: number; records: unknown[] }>;
    }
  | { ok: false; error: string };

/**
 * Answer a page that asks for a mock's records. Every page is told each
 * mock's state — its collections with their counts — and the records only
 * when it shows them: sent to every page as it connected, the records of
 * every mock made a page of a large project wait for megabytes it might
 * never show. Studio answers from its own copy of the store, the one each
 * report the page receives after the answer follows.
 *
 * @param socket - The page's socket
 * @param mocks - The mocks Studio runs, when it runs any
 * @example
 * ```ts
 * bindMockStore(socket, mockManager);
 * // in the page
 * socket.emit("mock:store:get", { serverId: "shop" }, (reply) => show(reply.collections));
 * ```
 */
export function bindMockStore(
  socket: Socket,
  mocks: Pick<LifecycleCoordinator, "describeServers"> | undefined,
): void {
  socket.on("mock:store:get", (raw: unknown, ack?: unknown) => {
    if (typeof ack !== "function") return;
    ack(storeOf(raw, mocks));
  });
}

function storeOf(
  raw: unknown,
  mocks: Pick<LifecycleCoordinator, "describeServers"> | undefined,
): MockStoreReply {
  const serverId = isPlainObject(raw) ? raw.serverId : undefined;
  if (typeof serverId !== "string") return { ok: false, error: "The page named no mock." };
  const state = mocks?.describeServers().find((each) => each.serverId === serverId);
  if (!state) return { ok: false, error: `Studio runs no mock named "${serverId}".` };
  return {
    ok: true,
    serverId,
    startedAt: state.startedAt ?? 0,
    storeSeq: state.storeSeq,
    collections: state.collections,
  };
}
