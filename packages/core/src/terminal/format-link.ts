import type { TerminalStyle } from "./terminal-style";

/* Scheme and host — a bracketed IPv6 address included — then the port, the
   path, and the fragment. */
const URL_PARTS = /^(https?:\/\/(?:\[[^\]]*\]|[^/:#?]*))(?::(\d+))?([^#]*)(#.*)?$/;

/**
 * An address as a banner shows it: the port in bold, and a fragment — the
 * token Studio's links carry — dimmed, so the part a reader compares stands
 * out. The text itself is unchanged, so it is copied and opened whole.
 *
 * @param url - The address
 * @param style - The style of the stream it is written to
 * @returns The address, styled
 * @example
 * ```ts
 * console.log(formatLink("http://localhost:6280/#token=k3y", styleFor(process.stdout)));
 * ```
 */
export function formatLink(url: string, style: TerminalStyle): string {
  const parts = URL_PARTS.exec(url);
  if (parts === null) return style.cyan(url);
  const [, origin = "", port, path = "", fragment = ""] = parts;
  const address = `${origin}${port === undefined ? "" : `:${style.bold(port)}`}${path}`;
  return `${style.cyan(address)}${fragment === "" ? "" : style.dim(fragment)}`;
}
