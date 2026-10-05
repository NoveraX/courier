"use client"

import { useId } from "react"

interface SandboxChoiceProps {
  label: string
  value: number
  options: readonly number[]
  onChange: (value: number) => void
}

/**
 * A number a sandbox's call takes, picked from the few the docs backend
 * answers for, under its name in the code face.
 *
 * @param props - The field's name, its value, the values to pick from, and what picking does
 * @returns The field
 * @example
 * ```tsx
 * <SandboxChoice label="id" value={id} options={[1, 2, 3]} onChange={setId} />
 * ```
 */
export function SandboxChoice({ label, value, options, onChange }: SandboxChoiceProps) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-mono text-meta text-fg-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8.5 w-full cursor-pointer rounded-[7px] border border-line bg-bg-subtle px-2 font-mono text-small text-fg outline-none focus-visible:border-brand"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}
