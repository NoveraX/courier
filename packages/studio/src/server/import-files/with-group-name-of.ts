/* How a group file declares its group, with or without a type on the binding. */
const GROUP_BINDING = /^export const ([A-Za-z_$][\w$]*)(\s*(?::[^=]+)?=\s*defineGroup\()/m;

/**
 * A group file's text with its group declared under the name another group
 * file declares its own by: the file a renamed group was written to, read
 * to be merged with the file the group is written to now, which declares it
 * under its new name. Merged as it was, the group kept its old name, and
 * the source that imports it by the new one did not compile.
 *
 * @param body - The file the group was written to
 * @param named - The file that declares the group as it is named now
 * @returns The text with the group's declaration renamed, or as it was when either declares none
 * @example
 * ```ts
 * withGroupNameOf("export const group = defineGroup({", "export const users = defineGroup({");
 * // → "export const users = defineGroup({"
 * ```
 */
export function withGroupNameOf(body: string, named: string): string {
  const name = GROUP_BINDING.exec(named)?.[1];
  if (name === undefined || !GROUP_BINDING.test(body)) return body;
  return body.replace(GROUP_BINDING, (_declaration, _old: string, rest: string) => {
    return `export const ${name}${rest}`;
  });
}
