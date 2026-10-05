import type { RequestEntry } from "@/store/types";

/** What a step of the middleware chain did. */
export interface PipelineStep {
  name: string;
  /** `before`, `wrap` or `after`, as the middleware declares it. */
  phase: string | undefined;
  duration: number | undefined;
  state: "ok" | "err" | "running";
  notes: { text: string; tone: "ok" | "err" }[];
}

/**
 * The middleware chain a request went through, in the order it ran: each
 * step's phase and time, the headers it added and the error it threw.
 *
 * @param r - The request
 * @returns The steps
 * @example
 * ```ts
 * middlewareSteps(request).map((s) => s.name); // ["auth", "retry", "logger"]
 * ```
 */
export function middlewareSteps(r: Pick<RequestEntry, "middlewareEntries">): PipelineStep[] {
  return [...r.middlewareEntries]
    .sort((a, b) => a.index - b.index)
    .map((entry) => ({
      name: entry.name,
      phase: entry.phase,
      duration: entry.duration,
      state: entry.status === "error" ? "err" : entry.status === "running" ? "running" : "ok",
      notes: [
        ...(entry.headersAdded ?? []).map((header) => ({
          text: `+ ${header}`,
          tone: "ok" as const,
        })),
        ...(entry.error ? [{ text: entry.error, tone: "err" as const }] : []),
      ],
    }));
}

/** One end of the proxy route. */
export interface RouteNode {
  kind: "browser" | "app" | "client" | "proxy" | "source";
  label: string;
}

/** The runtime that made a proxied call, as Studio knows it. */
export interface RouteCaller {
  id: string;
  kind: "browser" | "server" | undefined;
}

/** A leg of the proxy route: the time out and the time back. */
export interface RouteLeg {
  out: number;
  back: number;
}

/**
 * The way a proxied request went: from its caller to Courier's proxy and on
 * to the API, with the time each leg took either way. The caller is the
 * runtime that made the call — a page reads as Browser, a process by its
 * runtime's name — and a caller Studio never heard from reads as Client.
 *
 * @param r - The request
 * @param caller - The runtime that made the call, when it said so
 * @returns The three nodes and two legs, or `null` for a request not proxied or not timed
 * @example
 * ```ts
 * proxyRouteOf(request, { id: "vite-browser", kind: "browser" })?.nodes.map((n) => n.label);
 * // ["Browser", "Courier proxy", "api"]
 * ```
 */
export function proxyRouteOf(
  r: Pick<RequestEntry, "mode" | "proxyTiming" | "source">,
  caller: RouteCaller | undefined,
): { nodes: [RouteNode, RouteNode, RouteNode]; legs: [RouteLeg, RouteLeg] } | null {
  const t = r.proxyTiming;
  if (r.mode !== "proxy" || !t) return null;
  const app: RouteNode = !caller
    ? { kind: "client", label: "Client" }
    : caller.kind === "browser"
      ? { kind: "browser", label: "Browser" }
      : { kind: "app", label: caller.id };
  return {
    nodes: [app, { kind: "proxy", label: "Courier proxy" }, { kind: "source", label: r.source }],
    legs: [
      { out: t.clientToProxy, back: t.proxyToClient },
      { out: t.proxyToBackend, back: t.backendToProxy },
    ],
  };
}
