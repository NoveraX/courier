import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";

import type { FindingEndpoint } from "@/features/audit/finding-view";
import { summaryOf } from "@/features/audit/finding-view";
import type { AuditItem } from "@/features/audit/types";
import { cn } from "@/lib/utils";
import { CATEGORY_LOOK, SEVERITY_LOOK } from "./audit-look";
import { FindingCode } from "./finding-code";
import { FindingEndpoints } from "./finding-endpoints";

interface FindingCardProps {
  item: AuditItem;
  endpoints: readonly FindingEndpoint[];
  open: boolean;
  onToggle: () => void;
  onOpenCall: (id: string) => void;
}

/* On a phone the chevron stays beside the title, and the chips take a line under it. */
const END = "max-sm:col-start-3 max-sm:row-start-1 max-sm:self-center";

interface HeadProps extends Pick<FindingCardProps, "item" | "open" | "endpoints"> {
  /** Whether the finding has more to show when open. */
  expandable: boolean;
}

function Head({ item, open, endpoints, expandable }: HeadProps): React.ReactNode {
  const look = SEVERITY_LOOK[item.severity];
  const Icon = look.icon;
  return (
    <>
      <span
        className={cn(
          "flex size-7.5 items-center justify-center rounded-[9px]",
          look.dim,
          look.text,
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.75">
        <span className="text-item font-semibold">{item.title}</span>
        <span className="truncate text-small text-fg-subtle max-sm:whitespace-normal">
          {summaryOf(item)}
        </span>
      </span>
      <span
        className={cn(
          "flex items-center gap-1.5 max-sm:col-start-2 max-sm:row-start-2",
          endpoints.length === 0 && "max-sm:hidden",
        )}
      >
        <span className="flex h-5 items-center rounded-[5px] bg-raised px-1.75 text-badge text-fg-muted max-[1100px]:hidden">
          {CATEGORY_LOOK[item.category].label}
        </span>
        {endpoints.length > 0 && (
          <span className="flex h-5 items-center rounded-[5px] border border-line bg-inset px-1.75 font-mono text-meta whitespace-nowrap text-fg-muted">
            {endpoints.length} endpoint{endpoints.length === 1 ? "" : "s"}
          </span>
        )}
      </span>
      {!expandable ? (
        <span className={END} />
      ) : open ? (
        <ChevronUp aria-hidden="true" className={cn(END, "size-3.25 text-fg-subtle")} />
      ) : (
        <ChevronDown aria-hidden="true" className={cn(END, "size-3.25 text-fg-subtle")} />
      )}
    </>
  );
}

/**
 * One finding: its severity, title, a line on what was seen, its category
 * and how many endpoints it names; open, what it means, the suggested fix
 * and its code, and the endpoints with a way to their calls. On a phone the
 * line on what was seen wraps rather than being cut, and the count of
 * endpoints goes under it.
 *
 * @param props - The finding, its endpoints, whether it is open, and what opens it and a call
 * @returns The card
 * @example
 * ```tsx
 * <FindingCard item={item} endpoints={eps} open onToggle={toggle} onOpenCall={open} />
 * ```
 */
export function FindingCard({
  item,
  endpoints,
  open,
  onToggle,
  onOpenCall,
}: FindingCardProps): React.ReactNode {
  const look = SEVERITY_LOOK[item.severity];
  /* A finding that names endpoints has a line of its own under the title; its description says more. */
  const describes = (item.endpoints?.length ?? 0) > 0;
  const expandable =
    endpoints.length > 0 || item.suggestion !== undefined || item.codeSuggestion !== undefined;
  const shown = open && expandable;
  const body = `finding-${item.id}`;
  const row =
    "grid min-h-14.5 w-full grid-cols-[30px_minmax(0,1fr)_auto_14px] items-center gap-3 px-4 py-2.5 text-left max-sm:grid-cols-[30px_minmax(0,1fr)_14px] max-sm:items-start max-sm:gap-y-2";
  return (
    <article
      aria-label={item.title}
      className={cn(
        "overflow-hidden rounded-dialog border bg-panel",
        shown ? look.edge : "border-line",
      )}
    >
      {expandable ? (
        <button
          type="button"
          aria-expanded={shown}
          aria-controls={shown ? body : undefined}
          onClick={onToggle}
          className={cn(
            row,
            "cursor-pointer hover:bg-bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
          )}
        >
          <Head item={item} open={shown} endpoints={endpoints} expandable />
        </button>
      ) : (
        <div className={row}>
          <Head item={item} open={false} endpoints={endpoints} expandable={false} />
        </div>
      )}
      {shown && (
        <div
          id={body}
          className="flex flex-col gap-3.5 border-t border-line bg-bg-subtle pt-4 pr-4 pb-4.5 pl-14.5 max-sm:pl-4"
        >
          {describes && (
            <p className="m-0 max-w-190 text-ui leading-[1.6] text-pretty text-fg-muted">
              {item.description}
            </p>
          )}
          {item.suggestion && (
            <div className="flex max-w-190 gap-2.5 rounded-panel border border-line bg-panel px-3.25 py-2.75">
              <Lightbulb aria-hidden="true" className="mt-px size-3.5 shrink-0 text-warn" />
              <span className="text-control leading-[1.55] text-fg">{item.suggestion}</span>
            </div>
          )}
          {item.codeSuggestion && <FindingCode code={item.codeSuggestion} />}
          {endpoints.length > 0 && (
            <FindingEndpoints endpoints={endpoints} tone={look.text} onOpenCall={onOpenCall} />
          )}
        </div>
      )}
    </article>
  );
}
