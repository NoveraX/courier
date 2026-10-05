const DIGITS = /^[0-9]+$/;

/**
 * Read a whole number typed as text, within a range. Only digits are
 * accepted — no sign, fraction, exponent or surrounding text — so what is
 * sent is what was typed.
 *
 * @param text - The text typed
 * @param min - The smallest number accepted
 * @param max - The largest number accepted
 * @returns The number, or `null` when the text is not one in range
 *
 * @example
 * ```ts
 * parseWholeNumber("7001", 1, 65535); // → 7001
 * parseWholeNumber("1e3", 1, 65535); // → null
 * parseWholeNumber("", 1, 65535); // → null
 * ```
 */
export function parseWholeNumber(text: string, min: number, max: number): number | null {
  const trimmed = text.trim();
  if (!DIGITS.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}
