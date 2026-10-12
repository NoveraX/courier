import { Search } from "lucide-react";
import { useState } from "react";

import { directHeadersNote } from "@/features/requests/direct-headers-note";
import { headerGroupsOf } from "@/features/requests/header-groups";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { HeaderGroupSection } from "./header-group-section";

interface HeadersTabProps {
  request: RequestEntry;
  /** The headers its caller wrote that a proxy did not send upstream. */
  notForwarded?: Readonly<Record<string, string>> | undefined;
}

/**
 * A request's headers by side, each side folding, a filter over names and
 * values, credentials hidden until the eye shows them — and, for a direct
 * call, why some headers are missing, named for what sent it. A phone's
 * keyboard leaves the filter as typed.
 *
 * @param props - The request, and the headers its caller wrote that a proxy did not pass on
 * @returns The tab
 * @example
 * ```tsx
 * <HeadersTab request={request} />
 * <HeadersTab request={row} notForwarded={{ "x-trace": "abc" }} />
 * ```
 */
export function HeadersTab({ request, notForwarded }: HeadersTabProps): React.ReactNode {
  const runtimeKind = useStudioStore(
    (s) => s.bindingSnapshot.runtimes.find((r) => r.runtimeId === request.sessionId)?.kind,
  );
  const [filter, setFilter] = useState("");
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const toggle = (key: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <div className="flex flex-col gap-3 px-4.5 pt-4.5 pb-7">
      <label className="flex h-8 items-center gap-2 rounded-card border border-line bg-inset px-2.5 pointer-coarse:h-10">
        <Search aria-hidden="true" className="size-3 text-fg-subtle" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter headers by name or value…"
          aria-label="Filter headers"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
        />
      </label>
      {request.mode === "direct" && (
        <p className="m-0 text-label leading-normal text-fg-subtle">
          {directHeadersNote(runtimeKind)}
        </p>
      )}
      {headerGroupsOf(request, filter, notForwarded).map((group) => (
        <HeaderGroupSection
          key={group.key}
          group={group}
          open={!closed.has(group.key)}
          revealed={revealed}
          onToggle={() => toggle(group.key)}
          onReveal={() => setRevealed((r) => !r)}
          filtered={filter.trim() !== ""}
        />
      ))}
    </div>
  );
}
