import type { SegmentedOption } from "@/design/segmented";

/**
 * A setting's presets as a segmented control's options, with the value in
 * force among them in its place when it is none of them — one the mocks
 * file set, say — so the control always shows what the mock does.
 *
 * @param presets - The preset values, in order
 * @param current - The value in force
 * @param label - Names a value
 * @returns The options, in order of their values
 * @example
 * ```ts
 * optionsWith([0, 512, 1500], 750, String).map((o) => o.value); // ["0", "512", "750", "1500"]
 * ```
 */
export function optionsWith(
  presets: readonly number[],
  current: number,
  label: (value: number) => string,
): SegmentedOption<string>[] {
  const values = presets.includes(current) ? presets : [...presets, current].sort((a, b) => a - b);
  return values.map((value) => ({ value: String(value), label: label(value) }));
}
