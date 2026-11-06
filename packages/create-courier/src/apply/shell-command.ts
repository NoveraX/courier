/* The package managers Windows starts through a .cmd shim, which only its command shell runs. */
const SHIMS: ReadonlySet<string> = new Set(["npm", "npx", "pnpm", "yarn", "bun"]);

/*
 * What an argument may hold to reach a shim through Windows' command shell
 * as written: no space or quote, and none of the characters the shell
 * reads — & | < > ( ) % ! — so nothing in it can run as a command of its
 * own. The packages, flags and names the command passes all fit.
 */
const SAFE_ARGUMENT = /^[\w@/.\-~:=+^,]+$/;

/** A program as it is spawned: where it needs the shell, and its arguments as the shell is to read them. */
export interface Spawnable {
  readonly program: string;
  readonly args: readonly string[];
  readonly shell: boolean;
}

/**
 * How to spawn a command. Only a package manager's .cmd shim on Windows
 * goes through the command shell, each argument quoted — the shell reads
 * `^` as its escape outside quotes — and one that could be read as
 * anything else is refused. Node, and every other program, is spawned
 * directly, so what a person typed never reaches a shell.
 *
 * @param command - The program and its arguments
 * @param platform - The platform it runs on
 * @returns How to spawn it
 * @throws {Error} When an argument for a shim on Windows holds a character the shell would read
 * @example
 * ```ts
 * spawnable(["npm", "install", "zod@^4"], "win32"); // { program: "npm", args: ['"install"', '"zod@^4"'], shell: true }
 * ```
 */
export function spawnable(
  command: readonly string[],
  platform: NodeJS.Platform = process.platform,
): Spawnable {
  const [program = "", ...args] = command;
  if (platform !== "win32" || !SHIMS.has(program)) return { program, args, shell: false };
  const unsafe = args.find((arg) => !SAFE_ARGUMENT.test(arg));
  if (unsafe !== undefined) {
    throw new Error(
      `${program} is started through Windows' command shell, which would read ${JSON.stringify(unsafe)} as more than an argument`,
    );
  }
  return { program, args: args.map((arg) => `"${arg}"`), shell: true };
}
