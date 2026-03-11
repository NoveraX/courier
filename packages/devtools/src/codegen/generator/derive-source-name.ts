/**
 * Derives a camelCase source name from the spec title and/or baseURL.
 */

/** Derive a camelCase source name from the spec title and/or baseURL. */
export function deriveSourceName(title: string, baseURL?: string): string {
  // Try title first: strip noise words and non-Latin chars
  const cleaned = title
    .replace(/\b(api|service|platform|cloud|public|private|rest|restful|v\d+(\.\d+)*)\b/gi, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();

  if (cleaned) {
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      const parts = words.slice(0, 2);
      const result = parts
        .map((w, i) => {
          const lower = w.toLowerCase();
          return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join("");
      if (result) return result;
    }
  }

  // Fallback: extract domain name from baseURL (e.g. "https://api.timeweb.cloud/..." → "timeweb")
  if (baseURL) {
    try {
      const hostname = new URL(baseURL).hostname; // "api.timeweb.cloud"
      const parts = hostname.split(".");
      // Skip "api" prefix and TLD, take the main domain
      const meaningful = parts.filter(
        (p) => !["api", "www", "com", "org", "net", "io", "dev", "cloud", "app"].includes(p),
      );
      if (meaningful.length > 0 && meaningful[0]) {
        return meaningful[0].toLowerCase();
      }
    } catch {
      // not a valid URL, try as path
    }
  }

  return "api";
}
