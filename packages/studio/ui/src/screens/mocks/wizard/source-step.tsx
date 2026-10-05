import { Check, Loader2, Server } from "lucide-react";
import type { ScannedSource } from "@/features/apis/types";
import type { SourceAvailability } from "@/features/mocks/wizard/source-availability";
import type { MockDraft } from "@/features/mocks/wizard/types";
import { cn } from "@/lib/utils";

function endpointCountOf(source: ScannedSource): number {
  /* A source may declare endpoints outside any group. */
  return (
    source.groups.reduce((sum, group) => sum + group.endpoints.length, 0) +
    (source.inlineEndpoints?.length ?? 0)
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function Unavailable({ availability }: { availability: SourceAvailability }): React.ReactNode {
  switch (availability.kind) {
    case "connecting":
    case "loading":
      return (
        <p className="flex items-center justify-center gap-1.5 py-8 text-control text-fg-subtle">
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          {availability.kind === "connecting"
            ? "Connecting to Studio…"
            : "Studio is loading courier.config…"}
        </p>
      );
    case "failed":
      return (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-panel bg-err-dim px-3 py-2.5 text-err"
        >
          <p className="text-control">
            {availability.configFile} does not load, so there are no sources to mock. Fix it and
            they appear here.
          </p>
          <p className="font-mono text-small whitespace-pre-wrap opacity-80">
            {availability.message}
          </p>
        </div>
      );
    case "missing":
      return (
        <p className="py-8 text-center text-control text-fg-subtle">
          {availability.deleted
            ? "courier.config was deleted. Restore it to mock its sources."
            : "There is no courier.config.ts yet. Declare your API sources there first."}
        </p>
      );
    case "empty":
      return (
        <p className="py-8 text-center text-control text-fg-subtle">
          {availability.configFile} declares no API sources yet.
        </p>
      );
    case "sources":
      return null;
  }
}

interface SourceStepProps {
  availability: SourceAvailability;
  sources: readonly ScannedSource[];
  drafts: readonly MockDraft[];
  onToggle: (source: string) => void;
}

/**
 * The Sources step: the sources courier.config declares, each picked or
 * not for a mock of its own — or why there are none to pick.
 *
 * @param props - Whether there are sources, the sources, the ones picked, and what picking does
 * @returns The step
 * @example
 * ```tsx
 * <SourceStep availability={availability} sources={sources} drafts={state.drafts} onToggle={toggleSource} />
 * ```
 */
export function SourceStep({
  availability,
  sources,
  drafts,
  onToggle,
}: SourceStepProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-title font-semibold">Pick the API sources to mock</h3>
        <p className="text-small text-fg-subtle">
          Studio declares one mock for each in courier.mocks.ts; it serves every endpoint of its
          source.
        </p>
      </div>
      {availability.kind !== "sources" && <Unavailable availability={availability} />}
      {availability.kind === "sources" && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
          {sources.map((source) => {
            const on = drafts.some((draft) => draft.source === source.name);
            return (
              <button
                key={source.name}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(source.name)}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-[11px] border px-3 py-2.75 text-left hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand",
                  on ? "border-brand bg-brand-tint" : "border-line bg-inset",
                )}
              >
                <Server
                  aria-hidden="true"
                  className={cn("size-3.5 shrink-0", on ? "text-brand" : "text-syntax-type")}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-mono text-control font-medium">{source.name}</span>
                  <span className="truncate text-badge text-fg-subtle">{`${plural(endpointCountOf(source), "endpoint")} · ${plural(source.groups.length, "group")}`}</span>
                </span>
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-chip border-[1.5px]",
                    on ? "border-brand bg-brand text-bg" : "border-line-strong",
                  )}
                >
                  {on && <Check aria-hidden="true" className="size-2.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
