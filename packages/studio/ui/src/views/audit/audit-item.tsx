import { ChevronDown, ExternalLink, Lightbulb } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { CodeBlock as SyntaxBlock } from "../../components/shared/code-block";
import { Badge } from "../../components/ui/badge";
import { useRequestDetail } from "../../hooks/use-request-detail";
import { cn } from "../../lib/utils";
import { SEVERITY_CONFIG } from "./constants";
import type { AuditItem as AuditItemType } from "./types";

const VISIBLE_LIMIT = 5;

interface AuditItemProps {
  item: AuditItemType;
  expanded: boolean;
  onToggle: () => void;
}

export function AuditItemCard({ item, expanded, onToggle }: AuditItemProps): React.ReactNode {
  const cfg = SEVERITY_CONFIG[item.severity];
  const Icon = cfg.icon;
  const count = item.endpoints?.length ?? 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle transition-all",
        expanded ? "bg-card-elevated" : "bg-card hover:bg-card-elevated/50",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <Icon className={cn("size-4 shrink-0", cfg.color)} />
        <span className="text-body-sm font-medium flex-1 truncate">{item.title}</span>
        {count > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 tabular-nums">
            {count}
          </Badge>
        )}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && <ExpandedContent item={item} />}
      </AnimatePresence>
    </div>
  );
}

function ExpandedContent({ item }: { item: AuditItemType }): React.ReactNode {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden"
    >
      <div className="space-y-2.5 border-t border-border-subtle px-3 pb-3 pt-2.5">
        <p className="text-body-sm text-muted-foreground">{item.description}</p>

        {item.suggestion && (
          <div className="flex items-start gap-2 rounded-md bg-info-muted/30 px-3 py-2">
            <Lightbulb className="size-3.5 shrink-0 text-info-foreground mt-0.5" />
            <span className="text-body-sm text-info-foreground">{item.suggestion}</span>
          </div>
        )}

        {item.codeSuggestion && <SyntaxBlock code={item.codeSuggestion} language="ts" />}

        {item.endpoints && item.endpoints.length > 0 && (
          <EndpointsList endpoints={item.endpoints} />
        )}
      </div>
    </motion.div>
  );
}

function EndpointsList({
  endpoints,
}: {
  endpoints: NonNullable<AuditItemType["endpoints"]>;
}): React.ReactNode {
  const [showAll, setShowAll] = useState(false);
  const { selectRequest } = useRequestDetail();
  const needsCollapse = endpoints.length > VISIBLE_LIMIT;
  const visible = showAll ? endpoints : endpoints.slice(0, VISIBLE_LIMIT);

  return (
    <div className="rounded-md border border-border-subtle overflow-hidden">
      {visible.map((ep) => {
        const firstId = ep.requestIds?.[0];
        return (
          <div
            key={ep.key}
            className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle last:border-b-0"
          >
            <span className="mono-xs text-foreground">{ep.label}</span>
            <div className="flex items-center gap-2">
              {ep.detail && (
                <span className="text-[10px] text-muted-foreground tabular-nums">{ep.detail}</span>
              )}
              {firstId && (
                <button
                  type="button"
                  onClick={() => selectRequest(firstId)}
                  className="text-accent-brand hover:text-accent-brand/80 transition-colors"
                  title="View request details"
                >
                  <ExternalLink className="size-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {needsCollapse && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full px-3 py-1.5 text-[11px] text-accent-brand hover:bg-muted/50 transition-colors"
        >
          and {endpoints.length - VISIBLE_LIMIT} more…
        </button>
      )}
    </div>
  );
}
