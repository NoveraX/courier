"use client"

import { ResponseView } from "./response-view"

interface LabeledResponseProps {
  /** Which call answered: `users.getAll`, `JSON body`. */
  label: string
  data: unknown
  error?: Error | null | undefined
  pending?: boolean | undefined
}

/**
 * What one of a sandbox's several calls answered, under the call's name.
 *
 * @param props - The call's name, its answer or error, and whether it is in flight
 * @returns The answer
 * @example
 * ```tsx
 * <LabeledResponse label="users.getAll" data={users.data} error={users.error} pending={users.isLoading} />
 * ```
 */
export function LabeledResponse({ label, data, error, pending }: LabeledResponseProps) {
  return (
    <div className="min-w-0">
      <p className="m-0 mb-1.5 font-mono text-meta text-fg-subtle">{label}</p>
      <ResponseView data={data} error={error?.message} pending={pending} />
    </div>
  )
}
