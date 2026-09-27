/**
 * Small helpers the Studio server's routes share.
 */

/** Extract error message from unknown error */
export function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Auto-detect whether specUrl is a URL or file path */
export function isUrl(specUrl: string): boolean {
  return specUrl.startsWith("http://") || specUrl.startsWith("https://");
}
