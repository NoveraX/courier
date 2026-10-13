import { useEffect, useMemo, useRef, useState } from "react";
import { type JsonSearch, searchJson } from "@/features/requests/json-search";
import type { JsonLine } from "@/features/requests/json-tree";

/** A search over a payload, as its tab drives it. */
export interface PayloadSearch {
  query: string;
  setQuery: (query: string) => void;
  /** What the tree found, while a search runs over a value. */
  found: JsonSearch | undefined;
  /** The raw view's lines that hold the text, numbered from 1. */
  lines: ReadonlySet<number>;
  /** How many matches the view shown has, and which is current. */
  counted: { count: number; current: number } | undefined;
  /** The current match: a path in the tree, a line in the raw view. */
  currentPath: string | undefined;
  currentLine: number | undefined;
  step: (by: 1 | -1) => void;
  /** Holds the view, so the current match is brought into sight. */
  container: React.RefObject<HTMLDivElement | null>;
}

/**
 * Search a payload's tree or its raw text, and keep the current match in
 * sight as it moves.
 *
 * @param value - The payload, as parsed from JSON
 * @param lines - Its raw view's lines
 * @param mode - Which view shows
 * @returns The search
 * @example
 * ```ts
 * const search = usePayloadSearch(view.value, lines, mode);
 * ```
 */
export function usePayloadSearch(
  value: unknown,
  lines: readonly JsonLine[],
  mode: "tree" | "raw",
): PayloadSearch {
  const [query, setQueryState] = useState("");
  const [index, setIndex] = useState(0);
  const container = useRef<HTMLDivElement | null>(null);
  const found = useMemo(() => searchJson(value, query), [value, query]);
  const matchedLines = useMemo(() => {
    const sought = query.trim().toLowerCase();
    const numbers = new Set<number>();
    if (sought === "") return numbers;
    lines.forEach((line, at) => {
      if (line.text.toLowerCase().includes(sought)) numbers.add(at + 1);
    });
    return numbers;
  }, [lines, query]);
  const count = mode === "tree" ? (found?.matches.length ?? 0) : matchedLines.size;
  const current = count === 0 ? 0 : ((index % count) + count) % count;
  const currentPath = mode === "tree" ? found?.matches[current] : undefined;
  const currentLine = mode === "raw" ? [...matchedLines][current] : undefined;
  useEffect(() => {
    const at =
      currentPath !== undefined
        ? `[data-path="${CSS.escape(currentPath)}"]`
        : currentLine !== undefined
          ? `[data-line="${currentLine}"]`
          : undefined;
    if (at) container.current?.querySelector(at)?.scrollIntoView?.({ block: "nearest" });
  }, [currentPath, currentLine]);
  return {
    query,
    setQuery: (next) => {
      setQueryState(next);
      setIndex(0);
    },
    found,
    lines: matchedLines,
    counted: query.trim() === "" ? undefined : { count, current },
    currentPath,
    currentLine,
    step: (by) => setIndex((at) => at + by),
    container,
  };
}
