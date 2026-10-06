import { CloudUpload } from "lucide-react"

import { cn } from "@/site/cn"
import { LAB_PACES, LAB_SIZES, type LabPace, type LabSize } from "./lab-settings"

interface LabControlsProps {
  size: LabSize
  pace: LabPace
  sending: boolean
  onSize: (size: LabSize) => void
  onPace: (pace: LabPace) => void
  onSend: () => void
}

/**
 * The lab's toolbar: the file's size and the link's pace, then the button
 * that sends the file, naming how much it sends. With room for one row
 * the pickers sit on the left and the button at the right edge; on a
 * narrow screen each picker takes a row and the button the full width
 * under them.
 *
 * @param props - The picks, whether a send is under way, and what each control does
 * @returns The controls
 * @example
 * ```tsx
 * <LabControls size={8} pace={4} sending={false} onSize={setSize} onPace={setPace} onSend={go} />
 * ```
 */
export function LabControls({ size, pace, sending, onSize, onPace, onSend }: LabControlsProps) {
  return (
    <div className="flex flex-col gap-3 @min-[560px]:flex-row @min-[560px]:items-center @min-[560px]:gap-5">
      <Choice
        label="File"
        legend="File size"
        options={LAB_SIZES}
        value={size}
        unit="MB"
        disabled={sending}
        onPick={onSize}
      />
      <Choice
        label="Link"
        legend="Link speed"
        options={LAB_PACES}
        value={pace}
        unit="MB/s"
        disabled={sending}
        onPick={onPace}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        className="mt-1 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-fg px-4 text-[14px] font-medium text-bg transition-opacity hover:opacity-86 disabled:cursor-default disabled:opacity-55 @min-[560px]:mt-0 @min-[560px]:ml-auto @min-[560px]:h-9 @min-[560px]:w-auto @min-[560px]:min-w-[8.5rem] @min-[560px]:rounded-[9px] @min-[560px]:text-[13.5px]"
      >
        <CloudUpload aria-hidden="true" className="size-3.75" />
        {sending ? "Sending…" : `Send ${size} MB`}
      </button>
    </div>
  )
}

interface ChoiceProps<TValue extends number> {
  label: string
  /** What a screen reader hears the group as. */
  legend: string
  options: readonly TValue[]
  value: TValue
  unit: string
  disabled: boolean
  onPick: (value: TValue) => void
}

/* One picker: its name, the values as a segmented row, and their unit after them, said once. */
function Choice<TValue extends number>({
  label,
  legend,
  options,
  value,
  unit,
  disabled,
  onPick,
}: ChoiceProps<TValue>) {
  return (
    <fieldset className="m-0 flex min-w-0 items-center gap-2.5 border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      <span
        aria-hidden="true"
        className="w-9 shrink-0 font-mono text-micro tracking-[0.08em] text-fg-subtle uppercase @min-[560px]:w-auto"
      >
        {label}
      </span>
      <div className="flex flex-1 rounded-[9px] border border-line bg-inset p-0.75 @min-[560px]:flex-none">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-label={`${option} ${unit}`}
            aria-pressed={option === value}
            disabled={disabled}
            onClick={() => onPick(option)}
            className={cn(
              "h-8 flex-1 cursor-pointer rounded-[7px] px-3 font-mono text-label tabular-nums transition-colors disabled:cursor-default @min-[560px]:h-7 @min-[560px]:flex-none",
              option === value ? "bg-raised text-fg shadow-panel" : "text-fg-subtle hover:text-fg"
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <span
        aria-hidden="true"
        className="w-9 shrink-0 font-mono text-label text-fg-subtle @min-[560px]:w-auto"
      >
        {unit}
      </span>
    </fieldset>
  )
}
