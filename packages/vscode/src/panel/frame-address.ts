/**
 * The address Studio's frame loads in the editor's tab: the page, at the
 * address the editor reaches Studio by — a forwarded port when the
 * workspace is remote — with Studio's token and the editor's theme in its
 * fragment, which no request carries.
 *
 * @param page - The page of Studio to show
 * @param studio - Studio's address on this machine
 * @param outside - The address the editor reaches Studio by
 * @param token - Studio's token, when the project has one
 * @param theme - The editor's theme
 * @returns The address
 * @example
 * ```ts
 * frameAddress("http://localhost:6280/audit", "http://localhost:6280", "http://localhost:6280/", token, "dark");
 * // "http://localhost:6280/audit#token=…&theme=dark"
 * ```
 */
export function frameAddress(
  page: string,
  studio: string,
  outside: string,
  token: string | undefined,
  theme: "dark" | "light",
): string {
  const frame = new URL(page.slice(studio.length) || "/", outside);
  frame.hash = new URLSearchParams({ ...(token && { token }), theme }).toString();
  return frame.toString();
}
