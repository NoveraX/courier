import { ConfigurationError } from "../errors/configuration-error";
import { isRecord } from "../utils/is-record";
import { deriveSourceName, getSourceName, setSourceName } from "./api";

/**
 * Make each source's key its name, refusing a key that contradicts a name the
 * author chose.
 *
 * `name` in `defineApi` is not a label: the server resolves a page's call by
 * the key the source was registered under, and the routes module names the
 * source by that key. A key that contradicts the name would leave a client
 * that addresses the source by its name refused on every call.
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
          "string: the server resolves a call by this key, so the two must be the same.",
          "",
          `Use "${key}" in both places, or drop \`name\` and let the key decide.`,
        ].join("\n"),
      );
    }
    setSourceName(source, key);
  }
}

function wasChosen(source: unknown, name: string): boolean {
  return deriveSourceName(baseURLOf(source)) !== name;
}

function baseURLOf(source: unknown): string | undefined {
  if (!isRecord(source) || !isRecord(source.options)) return undefined;
  const { baseURL } = source.options;
  return typeof baseURL === "string" ? baseURL : undefined;
}
