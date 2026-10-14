import { LoaderCircle, ScanSearch, TriangleAlert } from "lucide-react";

import { formatSize } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { WholeSearchState } from "./use-whole-search";

interface WholeSearchNoteProps {
  state: WholeSearchState;
  /** The whole body's size, in bytes. */
  bytes: number;
  mode: "tree" | "raw";
}

const count = (n: number): string => n.toLocaleString("en-US");

/**
 * What a search over a whole body says of itself, in words.
 *
 * @param state - Where the search stands
 * @param size - The whole body's size, written out
 * @param mode - Which view it searched
 * @returns The sentence, or nothing while no search runs
 * @example
 * ```ts
 * wholeSearchText({ status: "searching" }, "2.1 MB", "tree"); // "Searching the whole body, 2.1 MB…"
 * ```
 */
export function wholeSearchText(
  state: WholeSearchState,
  size: string,
  mode: "tree" | "raw",
): string | undefined {
  if (state.status === "off") return undefined;
  if (state.status === "searching") return `Searching the whole body, ${size}…`;
  if (state.status === "failed") {
    return `The whole body could not be searched, so the search covers the part shown. ${state.reason}`.trim();
  }
  const { result } = state;
  if (!result.cut) return `Searched the whole body, ${size}.`;
  if (mode === "raw") {
    return `${count(result.count)} lines of the whole body, ${size}, hold it: the first ${count(result.lines.length)} show.`;
  }
  return result.count > result.matches.length
    ? `${count(result.count)} matches in the whole body, ${size}: the first ${count(result.matches.length)} show.`
    : `Searched the whole body, ${size}: the first ${count(result.rows.length)} rows of what it found show.`;
}

/**
 * The line under a search over a payload shown in part: that the whole
 * body is being searched, that it was — and how much of what it found
 * shows — or why it could not be, so the search covers the part shown.
 *
 * @param props - Where the search stands, the whole body's size, and the view searched
 * @returns The line, or nothing while no search runs
 * @example
 * ```tsx
 * <WholeSearchNote state={search.whole} bytes={view.cutFrom} mode={mode} />
 * ```
 */
export function WholeSearchNote({ state, bytes, mode }: WholeSearchNoteProps): React.ReactNode {
  const text = wholeSearchText(state, formatSize(bytes), mode);
  if (text === undefined) return null;
  const Icon =
    state.status === "searching"
      ? LoaderCircle
      : state.status === "failed"
        ? TriangleAlert
        : ScanSearch;
  return (
    <p role="status" className="m-0 flex items-center gap-2 px-0.5 text-small text-fg-muted">
      <Icon
        aria-hidden="true"
        className={cn(
          "size-3.25 shrink-0 text-fg-subtle",
          state.status === "searching" && "motion-safe:animate-spin",
          state.status === "failed" && "text-warn",
        )}
      />
      <span>{text}</span>
    </p>
  );
}
