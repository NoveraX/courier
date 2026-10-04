import { Globe, Laptop, Monitor, Server, Shuffle } from "lucide-react";

import type { RouteNode } from "@/features/requests/middleware-pipeline";
import { proxyRouteOf } from "@/features/requests/middleware-pipeline";
import { formatDuration } from "@/lib/formatters";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";

const NODE_ICON = {
  browser: Monitor,
  server: Server,
  client: Laptop,
  proxy: Shuffle,
  source: Globe,
} as const;

/**
 * The way a proxied call went — from the app to Courier's proxy and on to
 * the API — with each leg's time out and back.
 *
 * @param props - The request
 * @returns The section, or nothing for a call not proxied or not timed
 * @example
 * ```tsx
 * <ProxyRoute request={request} />
 * ```
 */
export function ProxyRoute({ request }: { request: RequestEntry }): React.ReactNode {
  const kind = useStudioStore(
    (s) => s.bindingSnapshot.runtimes.find((r) => r.runtimeId === request.sessionId)?.kind,
  );
  const route = proxyRouteOf(request, kind);
  if (!route) return null;
  const [app, proxy, source] = route.nodes;
  const [first, second] = route.legs;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="m-0 text-label font-semibold text-fg-muted">Proxy route</h3>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-panel border border-line bg-inset px-3.5 py-4">
        <Node node={app} />
        <Leg out={first.out} back={first.back} />
        <Node node={proxy} />
        <Leg out={second.out} back={second.back} />
        <Node node={source} />
      </div>
    </section>
  );
}

function Node({ node }: { node: RouteNode }): React.ReactNode {
  const Icon = NODE_ICON[node.kind];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="flex size-9 items-center justify-center rounded-panel border border-line-strong bg-panel text-fg-muted">
        <Icon aria-hidden="true" className="size-3.75" />
      </span>
      <span className="text-badge whitespace-nowrap text-fg-muted">{node.label}</span>
    </div>
  );
}

function Leg({ out, back }: { out: number; back: number }): React.ReactNode {
  return (
    <div className="flex flex-col gap-1.5 pb-4.5 font-mono text-meta">
      <span className="flex items-center gap-1.5 text-brand">
        <span aria-hidden="true" className="h-px flex-1 bg-current opacity-45" />
        {formatDuration(out)} →
      </span>
      <span className="flex items-center gap-1.5 text-ok">
        ← {formatDuration(back)}
        <span aria-hidden="true" className="h-px flex-1 bg-current opacity-45" />
      </span>
    </div>
  );
}
