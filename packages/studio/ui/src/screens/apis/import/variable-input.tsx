import { cn } from "@/lib/utils";

interface VariableInputProps {
  label: string;
  placeholder: string;
  /** The variable's name, as typed. */
  value: string;
  /** Whether Studio's environment sets each variable it answered for. */
  set: ReadonlyMap<string, boolean>;
  onChange: (value: string) => void;
}

/**
 * The name of the environment variable that holds a credential, with
 * whether Studio's environment sets it once Studio has said. A value is
 * never typed here.
 *
 * @param props - The field's label and example, the name, what Studio said, and what typing does
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
}: VariableInputProps): React.ReactNode {
  const known = set.get(value.trim());
  return (
    <label className="flex h-9.5 min-w-0 flex-1 items-center gap-2 rounded-[9px] border border-line-strong bg-inset px-3 focus-within:border-brand pointer-coarse:h-11">
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
