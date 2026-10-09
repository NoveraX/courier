import type { ParsedSpec } from "@/features/apis/types";

/**
 * Name an import after its spec: the spec's title, else the most telling
 * part of its base URL, else of the URL it was fetched from. Import API
 * names an import this way, and so does `courier-studio import`.
 *
 * @param spec - The parsed spec: its title and base URL
 * @param url - Where the spec was fetched from, for a URL import
 * @returns A camel-case name
 * @example
 * ```ts
 * deriveSourceName({ ...spec, title: "Pet Store" }); // → "petStore"
 * ```
 */
export function deriveSourceName(
  spec: Pick<ParsedSpec, "title" | "baseURL">,
  url?: string,
): string {
  const fromTitle = sanitize(spec.title);
  if (isUsable(fromTitle)) return toCamelCase(fromTitle);

  const fromBaseURL = extractDomain(spec.baseURL);
  if (isUsable(fromBaseURL)) return toCamelCase(fromBaseURL);

  const fromUrl = extractDomain(url);
  if (isUsable(fromUrl)) return toCamelCase(fromUrl);

  return fromTitle || "api";
}

const SKIP_NAMES = new Set([
  "api",
  "docs",
  "public",
  "swagger",
  "openapi",
  "v1",
  "v2",
  "v3",
  "www",
  "app",
  "cdn",
  "static",
  "dev",
  "staging",
]);
const TLDS = new Set([
  "com",
  "org",
  "net",
  "io",
  "dev",
  "cloud",
  "app",
  "co",
  "me",
  "ru",
  "uk",
  "de",
  "fr",
  "jp",
  "us",
  "eu",
  "info",
  "biz",
  "xyz",
]);

function isUsable(name: string): boolean {
  return name.length > 1 && !SKIP_NAMES.has(name) && !TLDS.has(name);
}

function sanitize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* The most telling part of a URL's host, skipping its TLD and generic subdomains. */
function extractDomain(url?: string): string {
  if (!url || !URL.canParse(url)) return "";
  const parts = new URL(url).hostname.split(".");
  for (let i = parts.length - 2; i >= 0; i--) {
    const part = parts[i];
    if (part !== undefined && isUsable(part)) return part;
  }
  return "";
}

function toCamelCase(kebab: string): string {
  return kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
