interface HighlightMatchProps {
  text: string;
  /** The text sought; blank marks nothing. */
  query: string;
}

/**
 * A text with each place a search found in it marked, whatever its case.
 *
 * @param props - The text, and what was sought in it
 * @returns The text, its matches marked
 * @example
 * ```tsx
 * <HighlightMatch text="Kazan" query="kaz" />
 * ```
 */
export function HighlightMatch({ text, query }: HighlightMatchProps): React.ReactNode {
  const sought = query.trim().toLowerCase();
  if (sought === "") return text;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(sought); at >= 0; at = lower.indexOf(sought, at + sought.length)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-[2px] bg-warn-dim text-inherit">
        {text.slice(at, at + sought.length)}
      </mark>,
    );
    from = at + sought.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}
