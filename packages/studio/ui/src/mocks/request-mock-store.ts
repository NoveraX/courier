import { getSocket } from "@/socket";
import { isPlainObject } from "@/socket/is-plain-object";
import { mockServerOf } from "@/store/mock-server-of";
import { useMockStore } from "@/store/mock-slice";
import { readMockCollections } from "@/store/payload";
import { shownMockServer } from "./shown-mock-server";

/* Long enough for Studio to send a store of many records. */
const REPLY_TIMEOUT_MS = 10_000;

/* The mocks whose records the page is waiting for, each asked for once at a time. */
const asking = new Set<string>();

/**
 * Ask Studio for a mock's records. Every page holds each mock's
 * collections with their counts; a page that shows a mock's records asks
 * for them, and keeps them up to date with the reports of the store that
 * follow. An answer the page no longer waits for, or one of a store the
 * mock has since replaced — it started again meanwhile — or left behind,
 * is passed over; one that does not come, or says why not, is kept on the
 * mock for the page to show, and the page asks again while it waits. A
 * page that lost Studio asks nothing: a request held until it is back would
 * bring the store long after the page stopped waiting for it.
 *
 * @param serverId - The mock
 * @example
 * ```ts
 * if (server.recordsLoaded === false) requestMockStore(server.serverId);
 * ```
 */
export function requestMockStore(serverId: string): void {
  const socket = getSocket();
  if (asking.has(serverId) || !socket.connected) return;
  asking.add(serverId);
  socket
    .timeout(REPLY_TIMEOUT_MS)
    .emit("mock:store:get", { serverId }, (error: Error | null, reply: unknown) => {
      asking.delete(serverId);
      takeStore(serverId, error ? undefined : reply);
    });
}

/**
 * Ask for the records of the mock the Mocks section shows, when the page
 * does not hold them: from the moment a link to the section is pointed at,
 * the records are on their way before it opens.
 *
 * @example
 * ```ts
 * createFileRoute("/mocks")({ loader: requestShownMockStore });
 * ```
 */
export function requestShownMockStore(): void {
  const { servers, activeServerId } = useMockStore.getState();
  const shown = shownMockServer(Object.values(servers), activeServerId);
  if (shown?.recordsLoaded === false) requestMockStore(shown.serverId);
}

function takeStore(serverId: string, reply: unknown): void {
  const store = useMockStore.getState();
  const server = mockServerOf(store.servers, serverId);
  if (server?.recordsLoaded !== false) return;
  const read =
    isPlainObject(reply) && reply.ok === true ? readMockCollections(reply.collections) : undefined;
  if (!isPlainObject(reply) || !read?.withRecords || typeof reply.storeSeq !== "number") {
    store.updateServer(serverId, { recordsProblem: problemOf(reply) });
    return;
  }
  if (reply.startedAt !== server.startedAt || reply.storeSeq < server.storeSeq) return;
  store.setServerCollections(serverId, read.collections, reply.storeSeq, true);
}

function problemOf(reply: unknown): string {
  if (reply === undefined) return `Studio did not answer within ${REPLY_TIMEOUT_MS / 1000} s.`;
  if (isPlainObject(reply) && typeof reply.error === "string") return reply.error;
  return "Studio's answer held no records the page could read.";
}
