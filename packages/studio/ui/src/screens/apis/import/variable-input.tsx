import { cn } from "@/lib/utils";

interface VariableInputProps {
  label: string;
  placeholder: string;
  /** The variable's name, as typed. */
  value: string;
  /** Whether Studio's environment sets each variable it answered for. */
  set: ReadonlyMap<string, boolean>;
  onChange: (value: string) => void;
  /** How it sits among the fields of a row that holds it: `flex-1` to take what the row leaves. */
  className?: string;
}

/**
 * The name of the environment variable that holds a credential, with
 * whether Studio's environment sets it once Studio has said. A value is
 * never typed here.
 *
 * It is as wide as what holds it lets it be. A row that holds it beside
 * other fields grows it with `className="flex-1"`; in a column, `flex-1`
 * would size its height instead and squeeze the field to its text.
 *
 * @param props - The field's label and example, the name, what Studio said, what typing does, and how it sits in a row
 * @returns The field
 * @example
 * ```tsx
 * <VariableInput label="Token variable" placeholder="ORDERS_SPEC_TOKEN" value={token} set={set} onChange={setToken} />
 * ```
 */
export function VariableInput({
  label,
  placeholder,
  value,
  set,
  onChange,
  className,
}: VariableInputProps): React.ReactNode {
  const known = set.get(value.trim());
  return (
    <label
      className={cn(
        "flex h-9.5 min-w-0 items-center gap-2 rounded-[9px] border border-line-strong bg-inset px-3 focus-within:border-brand pointer-coarse:h-11",
        className,
      )}
    >
      <span className="shrink-0 text-small text-fg-subtle">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent font-mono text-control text-fg outline-none placeholder:text-fg-subtle pointer-coarse:text-[16px]"
      />
      {known !== undefined && (
        <span
          className={cn(
            "shrink-0 rounded-[5px] px-1.5 py-0.5 text-badge font-strong",
            known ? "bg-ok-dim text-ok" : "bg-warn-dim text-warn",
          )}
        >
          {known ? "set" : "not set"}
        </span>
      )}
    </label>
  );
}
