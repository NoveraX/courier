/** A megabyte, in bytes. */
export const MB = 1024 * 1024

/** The sizes a visitor can send, in MB. */
export const LAB_SIZES = [4, 8, 16] as const

/** The paces the lab reads an upload at, in MB a second. */
export const LAB_PACES = [1, 2, 4] as const

export type LabSize = (typeof LAB_SIZES)[number]

export type LabPace = (typeof LAB_PACES)[number]

/** The header a send names its pace in, as one of the paces. */
export const LAB_PACE_HEADER = "x-upload-lab-pace"

/** The most the lab reads: the largest file and its form's framing. */
export const LAB_MAX_BYTES = 16 * MB + 64 * 1024

/**
 * Tell whether a number is one of the lab's paces.
 *
 * @param value - The number a send names
 * @returns Whether the lab reads at that pace
 * @example
 * ```ts
 * isLabPace(2) // true
 * isLabPace(3) // false
 * ```
 */
export function isLabPace(value: number): value is LabPace {
  return LAB_PACES.some((pace) => pace === value)
}
