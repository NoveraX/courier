import type { HTTPMode } from "../ws-http/http-socket-types";

/**
 * What the page keeps of the rung each socket's path reached — the HTTP
 * transport that carried it last — by its URL, the query aside. A path with
 * no rung kept opens a WebSocket.
 */
export interface RungMemory {
  /** The rung `url`'s path reached, if it fell back */
  get(url: string): HTTPMode | undefined;
  /** Keep the rung `url`'s path reached */
  set(url: string, rung: HTTPMode): void;
  /** Forget it: a WebSocket gets through again */
  forget(url: string): void;
}

/* What the page keeps: every connection to a URL starts where the last one stood. */
const page = new Map<string, HTTPMode>();
const STORED_PREFIX = "courier:ws:";

/**
 * The rungs the page keeps, every connection of it sharing them; with
 * `remember`, the tab's `sessionStorage` keeps the HTTP transports too, so
 * a page loaded again on a network that lets no WebSocket through starts on
 * HTTP, without waiting for a socket first. Storage refused — a private window, a sandboxed frame — is gone without.
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
      if (remember) store(path, rung);
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

function stored(path: string): HTTPMode | undefined {
  try {
    const rung = globalThis.sessionStorage?.getItem(STORED_PREFIX + path);
    return rung === "stream" || rung === "poll" ? rung : undefined;
  } catch {
    return undefined;
  }
}

function store(path: string, rung: HTTPMode | undefined): void {
  try {
    if (rung === undefined) globalThis.sessionStorage?.removeItem(STORED_PREFIX + path);
    else globalThis.sessionStorage?.setItem(STORED_PREFIX + path, rung);
  } catch {
    /* Storage refused: the page keeps the rung all the same. */
  }
}
