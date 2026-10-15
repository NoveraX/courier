import { Check, Copy, Minus, TriangleAlert, X } from "lucide-react";

import { TONE_DIM, TONE_TEXT } from "@/design/tone";
import type { RequestCheck } from "@/features/requests/request-checks";
import { requestChecks } from "@/features/requests/request-checks";
import { requestProperties } from "@/features/requests/request-properties";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { CalledFrom } from "./called-from";
import { SharedNote } from "./shared-note";
import { UrlBox } from "./url-box";

const CHECK_ICON = { ok: Check, warn: TriangleAlert, err: X, idle: Minus } as const;
const CHECK_TONE = { ok: "ok", warn: "warn", err: "err", idle: "muted" } as const;

/**
 * The request at a glance: its URL and chips, its properties — a click
 * copies one — the checks Courier ran, and where the project's code calls
 * its endpoint.
 *
 * @param props - The request
 * @returns The tab
 * @example
 * ```tsx
 * <OverviewTab request={request} />
 * ```
 */
export function OverviewTab({ request }: { request: RequestEntry }): React.ReactNode {
  const runtimeId = request.callerRuntimeId ?? request.sessionId;
  const runtimeKind = useStudioStore(
    (s) => s.bindingSnapshot.runtimes.find((r) => r.runtimeId === runtimeId)?.kind,
  );
  const sessionName = useStudioStore((s) => s.shownSession?.name);
  const requests = useStudioStore((s) => s.requests);
  const attempt = attemptOf(request, requests);
  const properties = requestProperties(request, { runtimeKind, sessionName, attempt });
  return (
    <div className="flex flex-col gap-5 px-4.5 pt-4.5 pb-7">
      <UrlBox request={request} />
      <SharedNote request={request} />
      <section className="flex flex-col">
        <h3 className="m-0 pb-1.5 text-label font-semibold text-fg-muted">Properties</h3>
        {properties.map((property) => (
          <button
            key={property.label}
            type="button"
            title="Click to copy"
            onClick={() => void copyToClipboard(property.value, property.label)}
            className="-mx-2 grid min-h-8 cursor-copy grid-cols-[108px_minmax(0,1fr)_14px] items-center gap-3 rounded-[6px] px-2 text-left transition-colors hover:bg-raised pointer-coarse:min-h-11"
          >
            <span className="text-control text-fg-subtle">{property.label}</span>
            <span className={cn("truncate text-control text-fg", property.mono && "font-mono")}>
              {property.value}
            </span>
            <Copy aria-hidden="true" className="size-2.75 text-fg-subtle opacity-45" />
          </button>
        ))}
      </section>
      <section className="flex flex-col">
        <h3 className="m-0 pb-2 text-label font-semibold text-fg-muted">Checks</h3>
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-panel border border-line p-0">
          {requestChecks(request).map((check) => (
            <CheckRow key={check.label} check={check} />
          ))}
        </ul>
      </section>
      {/* A webhook is called by its sender, not by the project's code. */}
      {request.mode !== "webhook" && (
        <CalledFrom
          source={request.source}
          endpoint={request.group ? `${request.group}.${request.method}` : request.method}
        />
      )}
    </div>
  );
}

function CheckRow({ check }: { check: RequestCheck }): React.ReactNode {
  const Icon = CHECK_ICON[check.state];
  const tone = CHECK_TONE[check.state];
  return (
    <li className="flex items-center gap-2.75 border-b border-line px-3 py-2.5 last:border-b-0">
      <span
        className={cn(
          "flex size-5.5 shrink-0 items-center justify-center rounded-[6px]",
          TONE_DIM[tone],
          TONE_TEXT[tone],
        )}
      >
        <Icon aria-hidden="true" className="size-3" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-control font-strong">{check.label}</span>
        <span className="truncate text-label text-fg-subtle">{check.detail}</span>
      </span>
      {check.meta && (
        <span className="font-mono text-badge whitespace-nowrap text-fg-subtle">{check.meta}</span>
      )}
    </li>
  );
}

/* The calls sent with this one's idempotency key, oldest first: a retry, a second click. */
function attemptOf(
  request: RequestEntry,
  requests: readonly RequestEntry[],
): { at: number; of: number } | undefined {
  const key = request.idempotencyKey;
  if (!key) return undefined;
  const same = requests.filter((other) => other.idempotencyKey === key);
  const ordered = [...same].sort((a, b) => a.startedAt - b.startedAt);
  return { at: ordered.findIndex((other) => other.id === request.id) + 1, of: ordered.length };
}
