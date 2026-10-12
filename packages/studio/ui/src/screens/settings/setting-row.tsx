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
 * part under it. In a section narrower than 480 pixels — a phone's, or one
 * squeezed beside the navigation — the control goes under the description,
 * which keeps the row's whole width, and scrolls sideways when it is wider
 * still.
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
    <div className="grid min-h-15.5 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-b border-line px-4.5 py-3 last:border-b-0 @max-[30rem]:grid-cols-1 @max-[30rem]:gap-y-2.5 @max-[30rem]:px-4">
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
      {control !== undefined && (
        <div className="flex min-w-0 items-center justify-end @max-[30rem]:scroll-row @max-[30rem]:-m-0.5 @max-[30rem]:justify-start @max-[30rem]:p-0.5">
          {control}
        </div>
      )}
      {children && <div className="col-span-full flex flex-col gap-2">{children}</div>}
    </div>
  );
}
