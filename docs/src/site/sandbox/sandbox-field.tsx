import type { ComponentPropsWithoutRef } from "react"
import { useId } from "react"

interface SandboxFieldProps extends ComponentPropsWithoutRef<"input"> {
  label: string
}

/**
 * An input of a sandbox, under its name in the code face.
 *
 * @param props - The field's name and the input's own props
 * @returns The field
 * @example
 * ```tsx
 * <SandboxField label="id" type="number" value={id} onChange={(e) => setId(e.target.value)} />
 * ```
 */
export function SandboxField({ label, ...props }: SandboxFieldProps) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-mono text-meta text-fg-muted">
        {label}
      </label>
      <input
        id={id}
        className="h-8.5 w-full rounded-[7px] border border-line bg-bg-subtle px-2.5 font-mono text-small text-fg outline-none placeholder:text-fg-subtle focus-visible:border-brand"
        {...props}
      />
    </div>
  )
}
