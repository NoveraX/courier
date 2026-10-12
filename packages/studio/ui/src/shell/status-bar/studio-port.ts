/**
 * The port the page reached Studio on, as the status bar names it: the
 * address's own, or the protocol's when the address leaves it out.
 *
 * @param location - The page's address
 * @returns The port
 * @example
 * ```ts
 * studioPort(window.location); // "6280"
 * ```
 */
export function studioPort({ port, protocol }: Pick<Location, "port" | "protocol">): string {
  return port || (protocol === "https:" ? "443" : "80");
}
