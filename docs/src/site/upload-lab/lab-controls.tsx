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
 * What the visitor picks before sending — the file's size and the link's
 * pace — and the button that sends it, naming how much it sends.
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <Choice
        label="File"
        options={LAB_SIZES}
        value={size}
        unit="MB"
        disabled={sending}
        onPick={onSize}
      />
      <Choice
        label="Link"
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
        className="flex h-9.5 cursor-pointer items-center gap-2 rounded-[9px] bg-fg px-4 text-[13.5px] font-medium text-bg transition-opacity hover:opacity-86 disabled:cursor-default disabled:opacity-55"
      >
        <CloudUpload aria-hidden="true" className="size-3.75" />
        {sending ? "Sending…" : `Send ${size} MB`}
      </button>
    </div>
  )
}

interface ChoiceProps<TValue extends number> {
  label: string
  options: readonly TValue[]
  value: TValue
  unit: string
  disabled: boolean
  onPick: (value: TValue) => void
}

function Choice<TValue extends number>({
  label,
  options,
  value,
  unit,
  disabled,
  onPick,
}: ChoiceProps<TValue>) {
  return (
    <fieldset className="m-0 flex min-w-0 items-center gap-2.5 border-0 p-0">
      <legend className="sr-only">{`${label}, in ${unit}`}</legend>
      <span
        aria-hidden="true"
        className="font-mono text-micro tracking-[0.08em] text-fg-subtle uppercase"
      >
        {label}
      </span>
      <div className="flex rounded-[9px] border border-line bg-inset p-0.75">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            disabled={disabled}
            onClick={() => onPick(option)}
            className={cn(
              "h-7 cursor-pointer rounded-[7px] px-2.5 font-mono text-label tabular-nums transition-colors disabled:cursor-default",
              option === value ? "bg-raised text-fg shadow-panel" : "text-fg-subtle hover:text-fg"
            )}
          >
            {option}
            <span className="text-fg-subtle"> {unit}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}
