const WINDOWS_DEVICES = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)$/;

/**
 * The directory name for a generated binding: kebab case, so two bindings
 * that differ only in letter case — `webhooks` and `webHooks` — never share
 * a directory on a case-insensitive file system. Every upper-case letter
 * becomes `-` and its lower case, which no binding contains otherwise, so
 * distinct bindings always get distinct names, whatever else the spec holds.
 * A name Windows reserves for a device gains a leading `_`, which a binding
 * only carries before a digit.
 *
 * @param binding - A binding as `toBindingName` makes them
 * @returns The directory name
 * @example
 * ```ts
 * directoryName("webHooks"); // "web-hooks"
 * directoryName("con"); // "_con"
 * ```
 */
export function directoryName(binding: string): string {
  const kebab = binding.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return WINDOWS_DEVICES.test(kebab) ? `_${kebab}` : kebab;
}
