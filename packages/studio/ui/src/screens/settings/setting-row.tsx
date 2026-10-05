interface SettingRowProps {
  label: string;
  description: string;
  /** Whether the draft changed it from the saved value. */
  edited?: boolean | undefined;
  /** The control, at the row's end. */
  control?: React.ReactNode;
  /** What spans the row under its label: a list, an editor, a confirmation. */
  children?: React.ReactNode;
}

/**
 * A row of Settings: what it sets and why, "edited" while the draft
 * changed it, the control at its end and, when it needs one, a full-width
 * part under it.
 *
 * @param props - The label, description, whether it is edited, the control and what spans the row
 * @returns The row
 * @example
 * ```tsx
 * <SettingRow label="JSON indentation" description="…" edited control={<Segmented … />} />
 * ```
 */
export function SettingRow({
  label,
  description,
  edited,
  control,
  children,
}: SettingRowProps): React.ReactNode {
  return (
    <div className="grid min-h-15.5 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-b border-line px-4.5 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.75">
        <span className="flex items-center gap-2 text-ui font-strong">
          {label}
          {edited && (
            <span className="flex h-4.25 items-center rounded-chip bg-warn-dim px-1.5 text-micro font-semibold text-warn">
              edited
            </span>
          )}
        </span>
        <span className="text-small leading-[1.45] text-fg-subtle">{description}</span>
      </div>
      <div className="flex min-w-0 items-center justify-end">{control}</div>
      {children && <div className="col-span-2 flex flex-col gap-2">{children}</div>}
    </div>
  );
}
