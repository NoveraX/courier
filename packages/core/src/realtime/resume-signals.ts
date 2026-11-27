import { CLIENT_LIMITS } from "./client-limits";

/**
 * A moment the page says a connection is worth checking or reopening at once:
 * the network came back, the page was shown again — its tab brought back,
 * or restored from the back/forward cache — or its window got focus.
 */
export type ResumeSignal = "online" | "visible" | "pageshow" | "focus";

/**
 * What an app that gives none of a page's signals says of itself: it is
 * shown again, back in the foreground, or its network came back.
 */
export type AppResumeSignal = Extract<ResumeSignal, "visible" | "online">;

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
 * `pageshow` of a page restored from the back/forward cache; window focus;
 * and those an app passes on with {@link resumeRealtime}.
 *
 * One set of listeners serves every connection on the page: they are added
 * to the page with the first listener and removed with the last, so
 * connections opened and closed for the page's whole life leave nothing
 * behind. Signals that come together — bringing a tab back fires
 * `visibilitychange`, `focus`, and at times `pageshow` — are told once:
 * after one is told, the others of the next `RESUME_DEBOUNCE_MS` are not.
 * Where there is no page — Node, React Native — only what the app passes on
 * is heard.
 *
 * @param listener - Hears each signal
 * @returns Stops hearing them
 * @example
 * ```ts
 * const stop = onResume((signal) => connection.dispatch({ type: "resume", signal }));
 * ```
 */
export function onResume(listener: ResumeListener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) detach = listenToPage();
  return () => {
    if (!listeners.delete(listener) || listeners.size > 0) return;
    detach?.();
    detach = undefined;
    clearTimeout(quiet);
    quiet = undefined;
  };
}

/**
 * Pass on what an app that gives none of a page's signals says of itself,
 * so its connections act on it as a page's do: one waiting to reconnect
 * does so at once, after a little wait at random when the network came
 * back, though not before a wait its server asked for, and one open is
 * checked — a socket with a ping, a stream heard from for too long ago
 * opened again. One whose `reconnectOnResume` is `false` is left as it is.
 * Told together with a page's, or again within a second, it is told once.
 *
 * @param signal - `"visible"`: the app is back in the foreground; `"online"`: its network is back
 * @example
 * ```ts
 * AppState.addEventListener("change", (state) => {
 *   if (state === "active") resumeRealtime("visible");
 * });
 * ```
 */
export function resumeRealtime(signal: AppResumeSignal): void {
  tell(signal);
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
    const document: unknown = Object.hasOwn(globalThis, "document")
      ? Reflect.get(globalThis, "document")
      : undefined;
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

/* The page's window and document listened to, where there is a page; what stops it. */
function listenToPage(): (() => void) | undefined {
  const window = eventSourceAt("window");
  const document = eventSourceAt("document");
  if (window === undefined && document === undefined) return undefined;
  return listen({ ...(window && { window }), ...(document && { document }) });
}

function eventSourceAt(name: "window" | "document"): EventSource | undefined {
  const target: unknown = Object.hasOwn(globalThis, name)
    ? Reflect.get(globalThis, name)
    : undefined;
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
