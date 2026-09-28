const SOURCE_NAME_KEY = Symbol.for("courier.source.name");

/**
 * Resolve event source names to canonical registry keys.
 * Handles: "_" fallback, derived names from getSourceName(), case mismatches.
 */
export function createSourceNameResolver(
  getCurrentSources: () => Record<string, unknown> | undefined,
): (name: string) => string {
  return (name: string): string => {
    const current = getCurrentSources();
    if (!current) return name;

    // Already a registry key — fast path
    if (Object.hasOwn(current, name)) return name;

    // "_" fallback (single-source direct mode without defineApi name)
    if (name === "_") {
      const keys = Object.keys(current);
      return (keys.length === 1 ? keys[0] : undefined) ?? name;
    }

    // Reverse lookup: find registry key whose source object has this stored name
    for (const [key, src] of Object.entries(current)) {
      const stored = (src as Record<symbol, unknown>)[SOURCE_NAME_KEY] as string | undefined;
      if (stored === name) return key;
    }

    // Case-insensitive fallback against registry keys
    const lower = name.toLowerCase();
    for (const key of Object.keys(current)) {
      if (key.toLowerCase() === lower) return key;
    }

    return name;
  };
}
