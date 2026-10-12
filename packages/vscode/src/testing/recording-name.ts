import { relative, sep } from "node:path";

/**
 * A recording's name as `courier-studio verify` takes it and reports it:
 * relative to its project, with forward slashes on every system.
 *
 * @param root - The project's root
 * @param path - The recording's path on disk
 * @returns Its name in the project
 * @example
 * ```ts
 * recordingName("C:\\shop", "C:\\shop\\tests\\recorded\\checkout.har"); // → "tests/recorded/checkout.har"
 * ```
 */
export function recordingName(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}
