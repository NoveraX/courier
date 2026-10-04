/** The environment variables the decision reads. */
type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Whether the terminal draws the symbols Courier's output uses — `●`, `▲`,
 * `✕`, `➜`.
 *
 * Every terminal on macOS and Linux does, except the Linux kernel's own
 * console. On Windows, Windows Terminal, VS Code's and JetBrains' terminals,
 * Cmder, Alacritty and rxvt do; the legacy console host, whose fonts lack
 * them, gets plain ASCII instead.
 *
 * @param env - The environment; the process's own by default
 * @param platform - The operating system; the process's own by default
 * @returns `true` when the symbols may be written
 * @example
 * ```ts
 * const arrow = supportsUnicode() ? "➜" : ">";
 * ```
 */
export function supportsUnicode(
  env: Environment = globalThis.process?.env ?? {},
  platform: string | undefined = globalThis.process?.platform,
): boolean {
  if (platform !== "win32") return env.TERM !== "linux";
  return (
    Boolean(env.WT_SESSION) ||
    Boolean(env.TERMINUS_SUBLIME) ||
    env.ConEmuTask === "{cmd::Cmder}" ||
    env.TERM_PROGRAM === "Terminus-Sublime" ||
    env.TERM_PROGRAM === "vscode" ||
    env.TERM === "xterm-256color" ||
    env.TERM === "alacritty" ||
    env.TERM === "rxvt-unicode" ||
    env.TERM === "rxvt-unicode-256color" ||
    env.TERMINAL_EMULATOR === "JetBrains-JediTerm"
  );
}
