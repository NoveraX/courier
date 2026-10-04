/* Contexts are a fixed set in practice; a program that makes them up per
   call stops filling the cache rather than growing it without end. */
const MAX_CACHED = 256;

const names = new Map<string, string>();

/**
 * The scope a context is logged under: `MockServer` → `mock-server`,
 * `HttpClient` → `http-client`, `WS` → `ws`.
 *
 * @param context - The name the logger was created with
 * @returns It in lower case, its words joined by hyphens
 * @example
 * ```ts
 * scopeName("RedisPubSub"); // "redis-pub-sub"
 * ```
 */
export function scopeName(context: string): string {
  const known = names.get(context);
  if (known !== undefined) return known;
  const name = context
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
  if (names.size < MAX_CACHED) names.set(context, name);
  return name;
}
