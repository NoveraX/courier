import { AppWindow, Shuffle } from "lucide-react";

import type { ProxyRoute } from "@/features/playground/proxy-route";
import type { UrlPart } from "@/features/playground/request-url";
import { cn } from "@/lib/utils";
import { methodClassOf } from "@/screens/explorer/method-class";

const PART_CLASS: Readonly<Record<UrlPart["kind"], string>> = {
  origin: "text-fg-subtle",
  path: "text-fg",
  param: "rounded-[3px] bg-brand-dim text-brand",
  missing: "rounded-[3px] bg-warn-dim text-warn",
  query: "text-syntax-string",
};

interface UrlBarProps {
  label: string;
  parts: readonly UrlPart[];
  /** In proxy mode, the route the call goes through — `null` when the source has none for it. */
  proxy: ProxyRoute | null | undefined;
  /** A stream or a channel the app serves itself: in direct mode it opens inside the app. */
  served?: boolean;
}

/**
 * The URL the call goes to: its method, the source's origin, the path with
 * each parameter filled from the variables — amber while one is missing —
 * the query, and in proxy mode the route on the app it goes through. A
 * stream or a channel the app serves itself, opened in direct mode, reaches
 * no host: it says so in place of the origin.
 *
 * @param props - The method label, the URL's pieces, the proxy route, and whether the app serves it
 * @returns The bar
 * @example
 * ```tsx
 * <UrlBar label="GET" parts={requestUrlParts(endpoint, variables)} proxy={undefined} />
 * ```
 */
export function UrlBar({ label, parts, proxy, served = false }: UrlBarProps): React.ReactNode {
  /* Opened inside the app, it reaches no host: its source's base URL is an upstream it never calls. */
  const inApp = served && proxy === undefined;
  return (
    <div className="flex h-8.5 min-w-0 items-center gap-2 overflow-hidden rounded-card border border-line bg-inset px-2.5 font-mono text-small whitespace-nowrap">
      <span className={cn("shrink-0 text-meta font-semibold", methodClassOf(label))}>{label}</span>
      {inApp && (
        <span
          title="Your app serves this itself: Direct mode opens it inside the app, not over the network"
          className="flex h-5.5 shrink-0 items-center gap-1.25 rounded-[5px] bg-brand-dim px-1.5 font-sans text-meta text-brand"
        >
          <AppWindow aria-hidden="true" className="size-2.75 shrink-0" />
          in your app
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {parts.map((part, index) =>
          inApp && part.kind === "origin" ? null : (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: the URL's pieces in order
              key={index}
              title={
                part.kind === "missing" ? `Set ${part.text.slice(2)} in the variables` : undefined
              }
              className={PART_CLASS[part.kind]}
            >
              {part.text}
            </span>
          ),
        )}
      </span>
      {proxy !== undefined && (
        <span
          title={
            proxy
              ? `Proxied calls go through ${proxy.display}${proxy.declared ? "" : " (Courier's default route)"}`
              : "This source declares no proxy route for the transport; declare one in proxyPath"
          }
          className={cn(
            "flex h-5.5 max-w-[45%] shrink-0 items-center gap-1.25 rounded-[5px] px-1.5 font-sans text-meta",
            proxy ? "bg-syntax-type/12 text-syntax-type" : "bg-warn-dim text-warn",
          )}
        >
          <Shuffle aria-hidden="true" className="size-2.75 shrink-0" />
          <span className="truncate">{proxy ? `via ${proxy.display}` : "no proxy route"}</span>
        </span>
      )}
    </div>
  );
}
