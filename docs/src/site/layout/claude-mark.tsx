import { siClaude } from "simple-icons"

/**
 * Claude's mark, in its own orange, for the actions that open a page in
 * Claude.
 *
 * @param props - Its classes
 * @returns The mark
 * @example
 * ```tsx
 * <ClaudeMark className="size-3.5" />
 * ```
 */
export function ClaudeMark({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path fill={`#${siClaude.hex}`} d={siClaude.path} />
    </svg>
  )
}
