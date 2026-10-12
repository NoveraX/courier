import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** What the field searches, for assistive technology. */
  label: string;
  className?: string | undefined;
  /** What sits at the field's end, after its clear button: a count. */
  children?: React.ReactNode;
}

/**
 * A toolbar's search field: a magnifier, the text, and a button that
 * clears it once there is any. On a touch screen it is a finger's height,
 * the clear button takes a wider tap, and the keyboard offers to search
 * rather than to correct or capitalise what is typed — names and paths,
 * not prose.
 *
 * @param props - The text, what changes it, its placeholder and label, and what follows it
 * @returns The field
 * @example
 * ```tsx
 * <SearchField value={q} onChange={setQ} placeholder="Search endpoints…" label="Search endpoints" />
 * ```
 */
export function SearchField(props: SearchFieldProps): React.ReactNode {
  const { value, onChange, placeholder, label, className, children } = props;
  return (
    <label
      className={cn(
        "flex h-7.5 items-center gap-2 rounded-control border border-line bg-panel px-2.5 pointer-coarse:h-9",
        className,
      )}
    >
      <Search aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear the search"
          onClick={() => onChange("")}
          className="hit-area relative flex cursor-pointer text-fg-subtle hover:text-fg"
        >
          <X aria-hidden="true" className="size-3.25" />
        </button>
      )}
      {children}
    </label>
  );
}
