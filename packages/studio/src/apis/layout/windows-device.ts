/* The device names Windows keeps, with or without an extension; `COM¹` counts as `COM1`. */
const WINDOWS_DEVICE =
  /^(?:con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3]|conin\$|conout\$)(?:\..*)?$/i;

/**
 * Tell whether Windows reads a file or folder name as a device rather than
 * as what it spells, extension or not.
 *
 * @param name - One name of a path
 * @returns Whether it is a device name
 * @example
 * ```ts
 * isWindowsDevice("aux.ts"); // true
 * isWindowsDevice("conin$"); // true
 * isWindowsDevice("console"); // false
 * ```
 */
export function isWindowsDevice(name: string): boolean {
  return WINDOWS_DEVICE.test(name);
}
