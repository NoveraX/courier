import type { ResolvedHandler } from "../types";

/** Callback invoked when a NEW handler needs to be pushed onto the stack */
export type OnRegister = (handler: ResolvedHandler) => void;

/** What a chain can decorate a handler with, apart from its response */
export type Decorations = Pick<
  ResolvedHandler,
  "headers" | "delayMs" | "latency" | "remaining" | "requiredState" | "newState"
>;

const DECORATION_KEYS = [
  "headers",
  "delayMs",
  "latency",
  "remaining",
  "requiredState",
  "newState",
] as const satisfies ReadonlyArray<keyof Decorations>;

/** The handler one builder chain writes to */
export interface BuilderTarget {
  /** The handler to write the response to, cleared of inherited decorations */
  forResponse(): ResolvedHandler;
  /** The handler to write anything else to, keeping the response it holds */
  forDecoration(): ResolvedHandler;
  /** Set decorations on the handler and keep them as this chain's own; headers are merged */
  decorate(decoration: Decorations): void;
  /** A status written with `withStatus`, which a later response keeps */
  explicitStatus?: number;
}

/**
 * The handler a builder chain writes to.
 *
 * Without an existing handler, a new one is registered at once. With one —
 * an auto-CRUD route, say — the chain's first method pushes a copy of it,
 * and every method then works on the copy. A chain that only decorates keeps
 * the copied response; one that answers anew drops the decorations it
 * inherited and keeps only those it wrote itself.
 *
 * @param onRegister Pushes a new handler onto its stack
 * @param existing   The endpoint's latest handler in the builder's layer, if any
 * @returns The chain's target
 * @example
 * ```ts
 * const target = createBuilderTarget((h) => registry.set("users", "list", h), existing);
 * target.forResponse().fn = () => [];
 * ```
 */
export function createBuilderTarget(
  onRegister: OnRegister,
  existing: ResolvedHandler | undefined,
): BuilderTarget {
  let handler: ResolvedHandler = existing ?? { fn: () => undefined, status: 200, isError: false };
  if (!existing) onRegister(handler);
  const own: Decorations = {};
  let answered = !existing;

  const forDecoration = (): ResolvedHandler => {
    if (existing && handler === existing) {
      handler = { ...existing, ...(existing.headers && { headers: { ...existing.headers } }) };
      onRegister(handler);
    }
    return handler;
  };

  return {
    forDecoration,
    forResponse() {
      const target = forDecoration();
      if (!answered) resetDecorations(target, own);
      answered = true;
      return target;
    },
    decorate({ headers, ...rest }) {
      const handler = forDecoration();
      Object.assign(own, rest);
      Object.assign(handler, rest);
      if (headers) {
        own.headers = { ...own.headers, ...headers };
        handler.headers = { ...handler.headers, ...headers };
      }
    },
  };
}

/** Clear an inherited handler down to this chain's own decorations, and to HTTP */
function resetDecorations(handler: ResolvedHandler, own: Decorations): void {
  for (const key of DECORATION_KEYS) delete handler[key];
  delete handler.transport;
  delete handler.streamFn;
  delete handler.channelFn;
  Object.assign(handler, own);
}
