import { AlertTriangle } from "lucide-react";

import type { InsertedLine } from "@/features/mocks/wizard/wire-types";

/**
 * Studio's warnings about a change, one a line.
 *
 * @param props - The warnings
 * @returns The list, or nothing when there are none
 * @example
 * ```tsx
 * <WarningNotes warnings={outcome.warnings} />
 * ```
 */
export function WarningNotes({ warnings }: { warnings: readonly string[] }): React.ReactNode {
  if (warnings.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 rounded-panel bg-warn-dim px-3 py-2.5">
      {warnings.map((warning, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: messages in the order they were raised; the same text may repeat
        <li key={`${index}:${warning}`} className="flex items-start gap-2 text-small text-warn">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          <span>{warning}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The lines Studio added that are left to remove by hand, each by its line
 * number, with what Studio added on a line the user also changed.
 *
 * @param props - The lines
 * @returns The list
 * @example
 * ```tsx
 * <InsertedLines lines={outcome.insertedLines} />
 * ```
 */
export function InsertedLines({ lines }: { lines: readonly InsertedLine[] }): React.ReactNode {
  return (
    <ol className="m-0 list-none overflow-auto rounded-[11px] border border-line bg-inset py-2.5 font-mono text-small leading-[1.7]">
      {lines.map((line) => (
        <li key={line.line} className="flex min-w-max items-baseline px-3">
          <span className="w-9 shrink-0 pr-2 text-right text-fg-subtle opacity-60 select-none">
            {line.line}
          </span>
          {line.added === line.text ? (
            <span className="bg-ok-dim whitespace-pre text-ok">
              <span className="sr-only">added: </span>
              {line.text}
            </span>
          ) : (
            <span className="whitespace-pre text-syntax-plain">
              {line.text}
              <span className="ml-3 text-ok">← Studio added: {line.added}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
