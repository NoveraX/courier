/**
 * What an edit tells the developer of the running mocks it restarts, which
 * lose the records they hold.
 *
 * @param restarting - The running mocks the edit restarts
 * @returns The warning, or none when it restarts none
 * @example
 * ```ts
 * restartWarning(["users"]); // → ["Running mocks restart to pick up the edit: users."]
 * ```
 */
export function restartWarning(restarting: readonly string[]): string[] {
  if (restarting.length === 0) return [];
  return [`Running mocks restart to pick up the edit: ${restarting.join(", ")}.`];
}
