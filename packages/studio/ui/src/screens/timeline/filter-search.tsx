import { Search } from "lucide-react";

/**
 * The search over a long filter's values, in its menu. A phone's keyboard
 * leaves what is typed as typed: no capital, no correction.
 *
 * @param props - The text, what changes it, and the filter's name
 * @returns The search
 * @example
 * ```tsx
 * <FilterSearch value={query} onChange={setQuery} label="Group" />
 * ```
 */
export function FilterSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}): React.ReactNode {
  const name = label.toLowerCase();
  return (
    <div className="shrink-0 px-2 pb-1.5">
      <label className="flex h-7.5 items-center gap-2 rounded-control border border-line bg-inset px-2.25 pointer-coarse:h-9">
        <Search aria-hidden="true" className="size-3 text-fg-subtle" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Search ${name}…`}
          aria-label={`Search ${name}`}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
        />
      </label>
    </div>
  );
}
