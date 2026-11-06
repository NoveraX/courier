import type { Socket } from "socket.io";

import { keptImportValue } from "./kept-import-value";
import { TOKEN_PAGES } from "./live-events";
import type { PageState, PageStateKey } from "./storage/page-state";

/* The import left unfinished: an address as it is typed, a part of one or a value pasted in a field. */
const IMPORT: PageStateKey = "apis.import";

/**
 * Keep what a page keeps in the project — its settings, whether the welcome
 * was shown, Get started's progress, the Playground's drafts — and send it
 * as it connects, saying whether this page may change it: one opened
 * without the token may not, and keeps its changes to itself. A change one
 * page makes, every other open page follows. The API import left
 * unfinished is the pages' with the token alone: one without it is sent
 * none, as it connects or as the import changes, so no address on its way
 * to being typed whole — a password before its `@` — reaches it. It is
 * kept and sent as {@link keptImportValue} has it, whichever page sent it.
 *
 * @param socket - The page's socket, in the room of the pages with the token when it presented it
 * @param pages - The page state in the project's database
 * @param writable - Whether the page has the token
 * @example
 * ```ts
 * bindPageState(socket, stores.pageState, trusted);
 * ```
 */
export function bindPageState(socket: Socket, pages: PageState, writable: boolean): void {
  const { [IMPORT]: kept, ...shared } = pages.read();
  const state =
    writable && kept !== undefined ? { ...shared, [IMPORT]: keptImportValue(kept) } : shared;
  socket.emit("page:state", { writable, state });
  socket.on("page:state:set", (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) return;
    const key: unknown = Reflect.get(raw, "key");
    const given: unknown = Reflect.get(raw, "value");
    const value = key === IMPORT ? keptImportValue(given) : given;
    if (!pages.write(key, value)) return;
    const others = key === IMPORT ? socket.to(TOKEN_PAGES) : socket.broadcast;
    others.emit("page:state:changed", { key, value });
  });
}
