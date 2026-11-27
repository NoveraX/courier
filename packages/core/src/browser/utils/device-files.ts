/**
 * Whether a form holds a file named by where it is on the device, as a
 * page's bundle has it: never. Only a React Native app's form holds one —
 * a page's `FormData` keeps such a value as the text `[object Object]` —
 * and the app's bundler builds for the `react-native` condition and takes
 * the server's module, which looks through the form; a bundler that builds
 * for the browser takes this one.
 *
 * @param _body - A request's body
 * @returns `false`
 * @example
 * ```ts
 * holdsDeviceFiles(new FormData()); // false
 * ```
 */
export function holdsDeviceFiles(_body: unknown): boolean {
  return false;
}
