import type { HTTPMode } from "../ws-http/http-socket-types";

/**
 * Where a socket's path stands on the transport ladder: the HTTP transport
 * that carried it last, or `absent` when none answers there. A path with no
 * rung kept opens a WebSocket.
 */
export type Rung = HTTPMode | "absent";

/** What the page keeps of the rung each socket's path reached: its URL's, the query aside. */
export interface RungMemory {
  /** The rung `url`'s path reached, if it fell back */
  get(url: string): Rung | undefined;
  /** Keep the rung `url`'s path reached */
  set(url: string, rung: Rung): void;
  /** Forget it: a WebSocket gets through again */
  forget(url: string): void;
}

/* What the page keeps: every connection to a URL starts where the last one stood. */
const page = new Map<string, Rung>();
const STORED_PREFIX = "courier:ws:";

/**
 * The rungs the page keeps, every connection of it sharing them; with
 * `remember`, the tab's `sessionStorage` keeps the HTTP transports too, so
 * a page loaded again on a network that lets no WebSocket through starts on
 * HTTP, without waiting for a socket first. That `absent` is kept for the
 * page alone: a server may turn its transport on before the tab closes.
 * Storage refused — a private window, a sandboxed frame — is gone without.
 * A rung is a path's — what is on the way decides it — so a URL's query,
 * which may carry what the application put there, is neither its key nor
 * kept.
 *
 * @param remember - Whether the tab's session keeps them too
 * @returns The memory
 * @example
 * ```ts
 * const memory = rungMemory(true);
 * memory.set("wss://api.example.com/ws", "poll");
 * memory.get("wss://api.example.com/ws"); // "poll"
 * ```
 */
export function rungMemory(remember: boolean): RungMemory {
  return {
    get(url) {
      const path = pathOf(url);
      return page.get(path) ?? (remember ? stored(path) : undefined);
    },
    set(url, rung) {
      const path = pathOf(url);
      page.set(path, rung);
      if (remember && rung !== "absent") store(path, rung);
    },
    forget(url) {
      const path = pathOf(url);
      page.delete(path);
      if (remember) store(path, undefined);
    },
  };
}

/* A URL up to its query or its fragment. */
function pathOf(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

function stored(path: string): Rung | undefined {
  try {
    const rung = globalThis.sessionStorage?.getItem(STORED_PREFIX + path);
    return rung === "stream" || rung === "poll" ? rung : undefined;
  } catch {
    return undefined;
  }
}

function store(path: string, rung: Rung | undefined): void {
  try {
    if (rung === undefined) globalThis.sessionStorage?.removeItem(STORED_PREFIX + path);
    else globalThis.sessionStorage?.setItem(STORED_PREFIX + path, rung);
  } catch {
    /* Storage refused: the page keeps the rung all the same. */
  }
}
