import { CLIENT_LIMITS } from "./client-limits";

/**
 * A moment the page says a connection is worth checking or reopening at once:
 * the network came back, the page was shown again — its tab brought back,
 * or restored from the back/forward cache — or its window got focus.
 */
export type ResumeSignal = "online" | "visible" | "pageshow" | "focus";

/** Hears each resume signal the page gives. */
export type ResumeListener = (signal: ResumeSignal) => void;

/* What the page's own event targets are read as, without the DOM library's types. */
interface EventSource {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

const listeners = new Set<ResumeListener>();
let detach: (() => void) | undefined;
let quiet: ReturnType<typeof setTimeout> | undefined;

/**
 * Hear the page's resume signals: `online`; the page made visible again;
 * `pageshow` of a page restored from the back/forward cache; window focus.
 *
 * One set of listeners serves every connection on the page: they are added
 * to the page with the first listener and removed with the last, so
 * connections opened and closed for the page's whole life leave nothing
 * behind. Signals that come together — bringing a tab back fires
 * `visibilitychange`, `focus`, and at times `pageshow` — are told once:
 * after one is told, the others of the next `RESUME_DEBOUNCE_MS` are not.
 * Where there is no page — Node, React Native — nothing is ever heard.
 *
 * @param listener - Hears each signal
 * @returns Stops hearing them
 * @example
 * ```ts
 * const stop = onResume((signal) => connection.dispatch({ type: "resume", signal }));
 * ```
 */
export function onResume(listener: ResumeListener): () => void {
  const page = pageTargets();
  if (page === undefined) return () => undefined;
  listeners.add(listener);
  if (listeners.size === 1) detach = listen(page);
  return () => {
    if (!listeners.delete(listener) || listeners.size > 0) return;
    detach?.();
    detach = undefined;
    clearTimeout(quiet);
    quiet = undefined;
  };
}

function tell(signal: ResumeSignal): void {
  if (quiet !== undefined) return;
  quiet = setTimeout(() => {
    quiet = undefined;
  }, CLIENT_LIMITS.RESUME_DEBOUNCE_MS);
  for (const listener of [...listeners]) listener(signal);
}

function listen(page: { window?: EventSource; document?: EventSource }): () => void {
  const online = (): void => tell("online");
  const focus = (): void => tell("focus");
  const visibility = (): void => {
    const document: unknown = Reflect.get(globalThis, "document");
    if (isObject(document) && Reflect.get(document, "visibilityState") === "visible") {
      tell("visible");
    }
  };
  /* A page loaded anew gives `pageshow` too; only one brought back from the
     back/forward cache had its sockets closed under it. */
  const pageshow = (event: unknown): void => {
    if (isObject(event) && Reflect.get(event, "persisted") === true) tell("pageshow");
  };
  page.window?.addEventListener("online", online);
  page.window?.addEventListener("focus", focus);
  page.window?.addEventListener("pageshow", pageshow);
  page.document?.addEventListener("visibilitychange", visibility);
  return () => {
    page.window?.removeEventListener("online", online);
    page.window?.removeEventListener("focus", focus);
    page.window?.removeEventListener("pageshow", pageshow);
    page.document?.removeEventListener("visibilitychange", visibility);
  };
}

/* The page's window and document, where there is a page to listen to. */
function pageTargets(): { window?: EventSource; document?: EventSource } | undefined {
  const window = eventSourceAt("window");
  const document = eventSourceAt("document");
  if (window === undefined && document === undefined) return undefined;
  return { ...(window && { window }), ...(document && { document }) };
}

function eventSourceAt(name: "window" | "document"): EventSource | undefined {
  const target: unknown = Reflect.get(globalThis, name);
  return isEventSource(target) ? target : undefined;
}

function isEventSource(value: unknown): value is EventSource {
  return (
    isObject(value) &&
    typeof Reflect.get(value, "addEventListener") === "function" &&
    typeof Reflect.get(value, "removeEventListener") === "function"
  );
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
