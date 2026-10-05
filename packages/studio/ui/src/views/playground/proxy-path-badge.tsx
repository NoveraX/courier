import { Check, Copy, Globe, Radio, Wifi } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProxyRoute } from "@/features/playground/proxy-route";
import { proxyRouteOf } from "@/features/playground/proxy-route";
import { cn } from "@/lib/utils";
import { writeClipboardText } from "@/lib/write-clipboard-text";
import type { CatalogEntry } from "@/store/types-ui";
import { ConfiguredTooltip } from "./configured-tooltip";

type Transport = "http" | "sse" | "ws";

interface ProxyPathBadgeProps {
  transport: Transport;
  source: CatalogEntry | null;
}

const TRANSPORT_ICON = { http: Globe, sse: Radio, ws: Wifi } as const;

export function ProxyPathBadge({ transport, source }: ProxyPathBadgeProps): React.ReactElement {
  const route = proxyRouteOf(transport, source);
  if (!route) return <NotConfiguredBadge transport={transport} />;
  return (
    <ConfiguredBadge
      transport={transport}
      display={route.display}
      kind={route.kind}
      appOrigin={source?.appOrigin}
      isDefault={!route.declared}
    />
  );
}

function ConfiguredBadge({
  transport,
  display,
  kind,
  appOrigin,
  isDefault,
}: {
  transport: Transport;
  display: string;
  kind: ProxyRoute["kind"];
  appOrigin: string | undefined;
  isDefault: boolean;
}): React.ReactElement {
  const Icon = TRANSPORT_ICON[transport];
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await writeClipboardText(display);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn("Copying the URL failed", err);
      toast.error(err instanceof Error ? err.message : "Could not copy the URL");
    }
  }, [display]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "group inline-flex h-7 max-w-96 items-center gap-1.5 rounded-md",
            "border border-border-subtle bg-muted/40 pl-2 pr-1.5",
            "transition-[background-color,border-color] duration-150",
            "hover:border-border hover:bg-muted/70",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60",
          )}
        >
          <Icon className="size-3 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground/80" />
          <span className="mono-sm truncate text-foreground/90">{display}</span>
          <span
            aria-hidden
            className="ml-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-all group-hover:bg-background/60 group-hover:text-foreground"
          >
            {copied ? (
              <Check className="size-2.5 text-emerald-400" />
            ) : (
              <Copy className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </span>
          <span className="sr-only">{copied ? "Copied" : "Copy URL"}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="max-w-md px-3 py-2">
        <ConfiguredTooltip
          transport={transport}
          kind={kind}
          appOrigin={appOrigin}
          isDefault={isDefault}
        />
      </TooltipContent>
    </Tooltip>
  );
}

function NotConfiguredBadge({ transport }: { transport: Transport }): React.ReactElement {
  const Icon = TRANSPORT_ICON[transport];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5">
          <Icon className="size-3 shrink-0 text-amber-300/80" />
          <span className="text-body-xs text-amber-200/90">not configured</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="max-w-xs">
        Set proxyPath.{transport} in your defineApi() options.
      </TooltipContent>
    </Tooltip>
  );
}
