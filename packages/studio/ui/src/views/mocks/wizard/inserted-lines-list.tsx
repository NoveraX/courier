import type { InsertedLine } from "./wire-types";

/**
 * The lines Studio wrote into a file it could not take its edit back from,
 * numbered as in the file. A line Studio wrote whole is marked as a whole;
 * on a line that was there before, only what Studio added is named, so
 * removing it by hand never removes the user's own code.
 *
 * @param props.lines - The lines Studio sent, in file order
 * @returns The list
 *
 * @example
 * ```tsx
 * <InsertedLinesList lines={outcome.insertedLines} />
 * ```
 */
export function InsertedLinesList({ lines }: { lines: readonly InsertedLine[] }): React.ReactElement {
  return (
    <ol className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 py-2 text-zinc-200">
      {lines.map((line) => (
        <li key={line.line} className="flex min-w-max items-baseline px-3">
          <span className="w-10 shrink-0 select-none pr-2 text-right mono-xs tabular-nums text-muted-foreground/60">
            {line.line}
          </span>
          {line.added === line.text ? (
            <span className="whitespace-pre bg-emerald-500/10 mono-sm text-emerald-300">
              <span className="sr-only">added: </span>
              {line.text}
            </span>
          ) : (
            <span className="whitespace-pre mono-sm">
              {line.text}
              <span className="ml-3 text-emerald-300">
                {"← Studio added: "}
                {line.added}
              </span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
