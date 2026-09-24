import { ConfigurationError } from "../errors/configuration-error";
import { deriveSourceName, getSourceName, setSourceName } from "./api";

/**
 * Make each source's key its name, refusing a key that contradicts a name the
 * author chose.
 *
 * `name` in `defineApi` is not a label: a browser client reads it off its own
 * copy of the definition, and the server resolves it against the key it was
 * registered under. Registration used to rename such a source silently, so
 * the server answered only the key and refused every call by the name.
 *
 * A name `defineApi` derived by itself is not a choice, and the key replaces
 * it. That is decided by asking the function `defineApi` used, never a copy of
 * its rule.
 *
 * @param sources - The sources by key.
 * @throws ConfigurationError `SOURCE_KEY_MISMATCH` when a key contradicts a chosen name.
 *
 * @example
 * ```ts
 * stampSourceKeys({ api: defineApi({ baseURL: "https://api.example" }) })
 * ```
 */
export function stampSourceKeys(sources: Readonly<Record<string, unknown>>): void {
  for (const [key, source] of Object.entries(sources)) {
    const existing = getSourceName(source);
    if (existing && existing !== key && wasChosen(source, existing)) {
      throw new ConfigurationError(
        "SOURCE_KEY_MISMATCH",
        [
          `Source key "${key}" conflicts with the name given to defineApi, "${existing}".`,
          "",
          "`name` is the identifier the proxy addresses this source by, not a display",
          "string: a browser client reads it off its own copy of the definition while",
          "the server resolves it against this key, so the two must be the same.",
          "",
          `Use "${key}" in both places, or drop \`name\` and let the key decide.`,
        ].join("\n"),
      );
    }
    setSourceName(source, key);
  }
}

function wasChosen(source: unknown, name: string): boolean {
  const baseURL = (source as { options?: { baseURL?: string } } | null)?.options?.baseURL;
  return deriveSourceName(baseURL) !== name;
}
