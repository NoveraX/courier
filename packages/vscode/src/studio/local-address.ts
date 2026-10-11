/* Any address in 127.0.0.0/8, as the URL parser writes it once it has read the forms an IPv4 address takes. */
const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * Whether an address is a Studio on this machine — `http:` or `https:` on
 * `localhost`, a `*.localhost` name or a loopback address, with no
 * credentials in it. The extension sends Studio the text of every file you
 * open; an address the project's own files name could otherwise send it to
 * any host, so any other is refused. In a remote window the extension runs
 * where the project is, and Studio answers there on its loopback too.
 *
 * @param address - The address a `.courier/studio.json` or a setting names
 * @returns Whether it may be asked
 * @example
 * ```ts
 * isLocalStudio("http://localhost:6280"); // true
 * isLocalStudio("https://studio.example.com"); // false
 * ```
 */
export function isLocalStudio(address: string): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  const host = url.hostname;
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    LOOPBACK_V4.test(host)
  );
}
