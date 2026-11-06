/**
 * The oldest Node.js a setup runs on: Studio and its mock, which the setup
 * installs, keep their data in Node's own SQLite, which needs no flag from
 * 22.13 on. Below it, the setup would pass and `npm run studio` refuse.
 */
export const NODE_FLOOR = { major: 22, minor: 13 } as const;

/**
 * Why the Node.js running the command is too old for the setup, if it is.
 *
 * @param version - The running Node's version, as `process.versions.node` gives it
 * @returns The refusal, in a sentence; `undefined` where it is new enough
 * @example
 * ```ts
 * nodeTooOld("22.12.0"); // "create-courier needs Node.js 22.13 or later, which Studio and its mock need: this is 22.12.0"
 * ```
 */
export function nodeTooOld(version: string = process.versions.node): string | undefined {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  const { major: floorMajor, minor: floorMinor } = NODE_FLOOR;
  if (major > floorMajor || (major === floorMajor && minor >= floorMinor)) return undefined;
  return `create-courier needs Node.js ${floorMajor}.${floorMinor} or later, which Studio and its mock need: this is ${version}`;
}
