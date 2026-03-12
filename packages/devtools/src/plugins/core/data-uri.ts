/**
 * Creates a base64-encoded data URI from a JS code snippet.
 * Used by webpack and Next.js plugins to inject code into entry bundles.
 */
export function createDataUri(snippet: string): string {
  return `data:text/javascript;base64,${Buffer.from(snippet).toString("base64")}`;
}
