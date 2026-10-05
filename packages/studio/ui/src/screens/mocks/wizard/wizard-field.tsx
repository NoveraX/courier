/** The text field the wizard's settings are typed in. */
export const FIELD_INPUT =
  "h-8.5 w-full max-w-50 rounded-card border border-line-strong bg-inset px-2.75 font-mono text-control text-fg outline-none focus-visible:border-brand aria-invalid:border-err";

interface WizardFieldProps {
  id: string;
  label: string;
  /** What the setting does, under its label. */
  sub: string;
  /** More on the setting, under its control. */
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}

/**
 * A setting of the wizard: its label and what it does on the left, its
 * control on the right with a hint and, when it has one, its problem.
 *
 * @param props - The control's id, the label and what it does, a hint, a problem, and the control
 * @returns The row
 * @example
 * ```tsx
 * <WizardField id="draft-0-key" label="Mock key" sub="its name under mocks">{input}</WizardField>
 * ```
 */
export function WizardField({
  id,
  label,
  sub,
  hint,
  error,
  children,
}: WizardFieldProps): React.ReactNode {
  return (
    <div className="grid min-h-12 grid-cols-[160px_minmax(0,1fr)] items-center gap-4 border-b border-line py-2 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-control font-strong">
          {label}
        </label>
        <span className="text-badge text-fg-subtle">{sub}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {children}
        {hint && (
          <p id={`${id}-hint`} className="text-badge text-fg-subtle">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="text-small text-err">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
