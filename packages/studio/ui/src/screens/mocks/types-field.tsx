import { useState } from "react";

import { typesOf, typesText } from "@/features/mocks/upload-conditions";
import { cn } from "@/lib/utils";

interface TypesFieldProps {
  /** The types in force. */
  value: readonly string[] | undefined;
  /** What the field reads while it holds none. */
  placeholder: string;
  /** What the field sets, for assistive technology. */
  label: string;
  disabled?: boolean | undefined;
  /** The field let go with other types in it: the types to send. */
  onCommit: (types: string[]) => void;
  className?: string | undefined;
}

/**
 * The types of file an upload may hold, typed as `<input accept>` lists
 * them — `image/*, .pdf`. What is typed is sent once the field is let go or
 * Enter is pressed, and only when it names other types; Escape puts back
 * the types in force.
 *
 * @param props - The types in force, the placeholder and label, and what follows a settled change
 * @returns The field
 * @example
 * ```tsx
 * <TypesField value={uploads.accept} placeholder="Any type" label="File types" onCommit={send} />
 * ```
 */
export function TypesField({
  value,
  placeholder,
  label,
  disabled = false,
  onCommit,
  className,
}: TypesFieldProps): React.ReactNode {
  const [draft, setDraft] = useState<string | null>(null);
  const settle = (): void => {
    if (draft === null) return;
    setDraft(null);
    const types = typesOf(draft);
    if (typesText(types) !== typesText(value)) onCommit(types);
  };
  return (
    <input
      type="text"
      aria-label={label}
      placeholder={placeholder}
      spellCheck={false}
      disabled={disabled}
      value={draft ?? typesText(value)}
      onFocus={() => setDraft(typesText(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={settle}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "h-7.5 min-w-0 rounded-control border border-line bg-inset px-2.5 font-mono text-small text-fg outline-none placeholder:font-sans placeholder:text-fg-subtle focus-visible:border-brand/60 disabled:opacity-50",
        className,
      )}
    />
  );
}
