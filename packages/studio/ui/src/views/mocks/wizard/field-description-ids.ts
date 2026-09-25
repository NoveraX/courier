/**
 * The ids a field's control points to with `aria-describedby`: its hint
 * and its error, as `FieldRow` names them.
 *
 * @param id - The control's id
 * @param hint - The hint shown, if any
 * @param error - The problem shown, if any
 * @returns The ids, space-separated, or `undefined` when neither is shown
 *
 * @example
 * ```ts
 * fieldDescriptionIds("draft-0-port", "Studio assigns one", undefined); // → "draft-0-port-hint"
 * ```
 */
export function fieldDescriptionIds(id: string, hint?: string, error?: string): string | undefined {
  const ids: string[] = [];
  if (hint) ids.push(`${id}-hint`);
  if (error) ids.push(`${id}-error`);
  return ids.length > 0 ? ids.join(" ") : undefined;
}
