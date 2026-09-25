interface FieldRowProps {
  /** The control's id; the label points to it, and the hint and error are named after it. */
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

/**
 * One field of a draft: its label, the control, a hint, and the problem
 * with the value when there is one. The control is expected to carry
 * `aria-describedby={fieldDescriptionIds(id, hint, error)}` and
 * `aria-invalid` when there is an error.
 *
 * @param props - The field's id, label, hint, error and control
 * @returns The field
 *
 * @example
 * ```tsx
 * <FieldRow id="draft-0-key" label="Mock key" error={errors.key}>
 *   <Input id="draft-0-key" aria-invalid={Boolean(errors.key)} aria-describedby={fieldDescriptionIds("draft-0-key", undefined, errors.key)} />
 * </FieldRow>
 * ```
 */
export function FieldRow({ id, label, hint, error, children }: FieldRowProps): React.ReactElement {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-start gap-x-4 gap-y-1">
      <label htmlFor={id} className="pt-1.5 text-xs text-muted-foreground">
        {label}
      </label>
      <div className="min-w-0 space-y-1">
        {children}
        {hint && (
          <p id={`${id}-hint`} className="text-body-xs text-muted-foreground/60">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="text-body-xs text-rose-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
