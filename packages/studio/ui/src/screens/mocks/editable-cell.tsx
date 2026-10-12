import { useState } from "react";

import type { FieldType } from "@/features/mocks/data-table-utils";
import { formatValue, parseValue } from "@/features/mocks/data-table-utils";
import { cn } from "@/lib/utils";

interface EditableCellProps {
  value: unknown;
  type: FieldType;
  /** A cell that cannot change, such as a record's id. */
  locked: boolean;
  /** An enum's values read in the keyword colour. */
  enumLike: boolean;
  onSave: (value: unknown) => void;
}

/**
 * A cell of a collection's table: its value, and on a click an input that
 * saves on Enter or when it loses focus, and gives up on Escape. A phone's
 * keyboard leaves what is typed as typed — no capitals, no corrections —
 * and offers Done for Enter.
 *
 * @param props - The value, its type, whether it is locked or an enum, and what saves it
 * @returns The cell
 * @example
 * ```tsx
 * <EditableCell value="Ada" type="str" locked={false} enumLike={false} onSave={save} />
 * ```
 */
export function EditableCell({
  value,
  type,
  locked,
  enumLike,
  onSave,
}: EditableCellProps): React.ReactNode {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const text = formatValue(value);
  const finish = (save: boolean) => {
    if (save && draft !== undefined && draft !== text) onSave(parseValue(draft, type));
    setDraft(undefined);
  };
  if (draft !== undefined) {
    return (
      <input
        // biome-ignore lint/a11y/noAutofocus: the input appears because the cell was clicked to edit it
        autoFocus
        value={draft}
        aria-label="Edit value"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true);
          else if (e.key === "Escape") finish(false);
        }}
        className="h-7 w-full min-w-0 rounded-[6px] border border-brand/60 bg-inset px-2 font-mono text-control text-fg outline-none pointer-coarse:h-9 pointer-coarse:text-base"
      />
    );
  }
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => setDraft(text)}
      title={locked ? undefined : "Click to edit"}
      className={cn(
        "flex h-7 w-full min-w-0 items-center truncate rounded-[6px] px-2 text-left font-mono text-control enabled:cursor-text enabled:hover:bg-raised disabled:cursor-default pointer-coarse:h-9",
        value === null || value === undefined
          ? "text-fg-subtle"
          : enumLike
            ? "text-syntax-keyword"
            : "text-fg",
      )}
    >
      <span className="truncate">{text}</span>
    </button>
  );
}
